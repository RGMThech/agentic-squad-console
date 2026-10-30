"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import sodium from "libsodium-wrappers";
import { env } from "./env";
import { appBotLogin, errDetail, errMsg, gh, missingPermissions, readFile, resetAppCache, status, writeFile } from "./github";
import { store } from "./db";
import { sendInvite } from "./mail";
import { isValidEmail, normalizeEmail } from "./otp";
import { requireUser } from "./session";
import { isRunning, listFeatureIds, listRuns, listSquadPRs, loadFeature, loadSquad, prChecks, secretStatus, type SquadContext } from "./squad";
import { normalizeHost, parseLeitura, setDatabricksYaml, testConnection, validateDbxConfig, type Check, type DbxConfig } from "./databricks";
import {
  RE_AGENT,
  applyAnswers,
  parseDoubts,
  RE_FEATURE,
  RE_NAME,
  can,
  isEditablePath,
  nextFeatureId,
  setFrontmatter,
  serializeMembers,
  setMemberRole,
  type Role,
  slugify,
  todaySaoPaulo,
  validateConfigContent,
} from "./core";

export type ActionState = { ok?: boolean; error?: string; message?: string; url?: string };

const MAX_INSTRUCAO = 6000;

function str(fd: FormData, k: string, max = 2000): string {
  return String(fd.get(k) ?? "").trim().slice(0, max);
}

async function ctxFrom(fd: FormData, need: "acionar" | "aprovar" | "configurar"): Promise<SquadContext> {
  const owner = str(fd, "owner", 100);
  const repo = str(fd, "repo", 100);
  if (!RE_NAME.test(owner) || !RE_NAME.test(repo)) throw new Error("Squad inválida.");
  const user = await requireUser();
  const ctx = await loadSquad(user, owner, repo);
  if (!ctx) throw new Error("Squad não encontrada ou sem acesso.");
  if (!can(ctx.role, need)) {
    const papel = need === "acionar" ? "membro ou operador" : "operador";
    throw new Error(`Esta ação exige o papel de ${papel}. Seu papel nesta squad: ${ctx.role}.`);
  }
  return ctx;
}

function quem(ctx: SquadContext) {
  return `${ctx.user.name} <${ctx.user.email}>`;
}

function base(ctx: SquadContext) {
  return `/s/${ctx.owner}/${ctx.repo}`;
}

async function dispatch(ctx: SquadContext, agente: string, feature: string, instrucao: string) {
  if (!RE_AGENT.test(agente)) throw new Error("Agente inválido.");
  if (!RE_FEATURE.test(feature)) throw new Error("Feature inválida.");
  const agentFile = await readFile(ctx.o, ctx.owner, ctx.repo, `.claude/agents/${agente}.md`, ctx.defaultBranch);
  if (!agentFile) throw new Error(`O agente "${agente}" não existe em .claude/agents.`);
  try {
    await ctx.o.actions.createWorkflowDispatch({
      owner: ctx.owner,
      repo: ctx.repo,
      workflow_id: "squad-agent.yml",
      ref: ctx.defaultBranch,
      inputs: { agente, feature, instrucao: instrucao.slice(0, MAX_INSTRUCAO), solicitante: ctx.user.email },
    });
  } catch (e) {
    if (status(e) === 404) throw new Error("Workflow squad-agent.yml não encontrado na branch principal da squad.");
    throw e;
  }
}

async function comment(ctx: SquadContext, prNumber: number | undefined, body: string) {
  if (!prNumber) return;
  await ctx.o.issues.createComment({ owner: ctx.owner, repo: ctx.repo, issue_number: prNumber, body }).catch(() => undefined);
}

// ---------------------------------------------------------------- nova feature

export async function createFeature(_: ActionState, fd: FormData): Promise<ActionState> {
  let destino = "";
  try {
    const ctx = await ctxFrom(fd, "acionar");
    const titulo = str(fd, "titulo", 120);
    const problema = str(fd, "problema", 3000);
    if (titulo.length < 4) return { error: "Dê um título com pelo menos 4 caracteres." };
    if (problema.length < 20) return { error: "Descreva o problema de negócio com um pouco mais de detalhe." };
    const ids = (await listFeatureIds(ctx)).map((f) => f.id);
    const feature = nextFeatureId(ids, titulo);
    const campos: [string, string][] = [
      ["Título", titulo],
      ["Problema de negócio", problema],
      ["Quem usa", str(fd, "publico", 600)],
      ["Decisão que será tomada", str(fd, "decisao", 600)],
      ["Fontes conhecidas", str(fd, "fontes", 800)],
      ["Prazo / SLA", str(fd, "sla", 300)],
      ["Observações", str(fd, "obs", 1200)],
    ];
    const pedido = campos
      .filter(([, v]) => v)
      .map(([k, v]) => `**${k}:** ${v}`)
      .join("\n");
    const instrucao = `Crie a spec da feature ${feature} (specs/${feature}/spec.md, id ${feature.slice(0, 3)}) a partir deste pedido de ${quem(ctx)}. Liste todas as dúvidas em "Dúvidas abertas" e deixe status: em_revisao.\n\n${pedido}`;
    await dispatch(ctx, "analista-requisitos", feature, instrucao);
    destino = `${base(ctx)}/f/${feature}?novo=1`;
  } catch (e) {
    return { error: errMsg(e) };
  }
  redirect(destino);
}

// ---------------------------------------------------------------- acionar agente

export async function runAgent(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await ctxFrom(fd, "acionar");
    const feature = str(fd, "feature", 80);
    const agente = str(fd, "agente", 50);
    const instrucao = str(fd, "instrucao", MAX_INSTRUCAO);
    if (instrucao.length < 5) return { error: "Escreva a instrução para o agente." };
    await dispatch(ctx, agente, feature, instrucao);
    revalidatePath(`${base(ctx)}/f/${feature}`);
    return { ok: true, message: `Agente ${agente} acionado. A execução aparece aqui em alguns segundos.` };
  } catch (e) {
    return { error: errMsg(e) };
  }
}

// ---------------------------------------------------------------- gates G1 / G2

export async function approveGate(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await ctxFrom(fd, "aprovar");
    const feature = str(fd, "feature", 80);
    const gate = str(fd, "gate", 3);
    const auto = fd.get("auto") === "on";
    if (!RE_FEATURE.test(feature) || !["G1", "G2"].includes(gate)) return { error: "Pedido inválido." };

    const prs = await listSquadPRs(ctx);
    const f = await loadFeature(ctx, feature, true, prs);
    if (!f.branch) return { error: "A feature não tem branch ativa." };
    const doc = gate === "G1" ? f.spec : f.design;
    if (!doc) return { error: gate === "G1" ? "Ainda não existe spec.md." : "Ainda não existe design.md." };
    if (doc.data.status === "aprovado") return { ok: true, message: `${gate} já estava aprovado.` };
    if (gate === "G1" && f.doubts.length) {
      return { error: `A spec ainda tem ${f.doubts.length} dúvida(s) aberta(s). Responda ao analista antes de aprovar.` };
    }
    if (gate === "G2" && f.gates.g1 !== "aprovado") return { error: "Aprove o G1 antes do G2." };

    const novo = setFrontmatter(doc.raw, {
      status: "aprovado",
      aprovado_por: ctx.user.email,
      aprovado_em: todaySaoPaulo(),
    });
    await writeFile(ctx.o, {
      owner: ctx.owner,
      repo: ctx.repo,
      path: doc.path,
      branch: f.branch,
      sha: doc.sha,
      content: novo,
      message: `gate(${gate}): ${gate === "G1" ? "spec" : "design"} de ${feature} aprovad${gate === "G1" ? "a" : "o"} por ${quem(ctx)}`,
    });
    await comment(ctx, f.pr?.number, `🧍 **${gate} aprovado** por ${quem(ctx)} no Console da Squad.`);

    let extra = "";
    if (auto) {
      const [agente, instrucao] =
        gate === "G1"
          ? ["arquiteto-dados", `A spec de ${feature} foi aprovada no G1 por ${quem(ctx)}. Produza specs/${feature}/design.md, os contratos e ADRs necessários e deixe status: em_revisao.`]
          : ["orquestrador", `Spec e design de ${feature} aprovados (G2 por ${quem(ctx)}). Gere tasks.md e conduza implementação, QA, revisão e documentação até o G3 ficar pronto.`];
      await dispatch(ctx, agente, feature, instrucao);
      extra = ` ${agente} acionado.`;
    }
    revalidatePath(`${base(ctx)}/f/${feature}`);
    return { ok: true, message: `${gate} aprovado.${extra}` };
  } catch (e) {
    return { error: errMsg(e) };
  }
}

export async function requestChanges(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await ctxFrom(fd, "aprovar");
    const feature = str(fd, "feature", 80);
    const gate = str(fd, "gate", 3);
    const feedback = str(fd, "feedback", 5000);
    if (feedback.length < 5) return { error: "Escreva o que precisa mudar." };
    const agente = gate === "G1" ? "analista-requisitos" : gate === "G2" ? "arquiteto-dados" : "orquestrador";
    const prs = await listSquadPRs(ctx);
    const f = await loadFeature(ctx, feature, true, prs);
    await comment(ctx, f.pr?.number, `🧍 **Ajustes solicitados no ${gate}** por ${quem(ctx)}:\n\n${feedback}`);
    await dispatch(
      ctx,
      agente,
      feature,
      `O Operador ${quem(ctx)} pediu ajustes no ${gate} da feature ${feature}. Trate cada ponto, atualize os artefatos e mantenha status: em_revisao.\n\nAjustes solicitados:\n${feedback}`,
    );
    revalidatePath(`${base(ctx)}/f/${feature}`);
    return { ok: true, message: `Ajustes enviados para ${agente}.` };
  } catch (e) {
    return { error: errMsg(e) };
  }
}

// ---------------------------------------------------------------- G3 (merge)

export async function approveG3(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await ctxFrom(fd, "aprovar");
    const feature = str(fd, "feature", 80);
    const prs = await listSquadPRs(ctx);
    const f = await loadFeature(ctx, feature, true, prs);
    if (f.gates.g1 !== "aprovado" || f.gates.g2 !== "aprovado") return { error: "G1 e G2 precisam estar aprovados." };
    if (!f.pr || f.pr.state !== "open") return { error: "Não há Pull Request aberto para esta feature." };
    const checks = await prChecks(ctx, f.pr.headSha);
    if (checks.state === "failure") return { error: `${checks.failed} checagem(ns) falharam no PR. Corrija antes do G3.` };
    if (checks.state === "pending") return { error: "Ainda há checagens rodando no PR. Aguarde terminarem." };

    if (f.pr.draft) {
      await ctx.o.graphql(
        `mutation($id: ID!) { markPullRequestReadyForReview(input: { pullRequestId: $id }) { clientMutationId } }`,
        { id: f.pr.nodeId },
      );
    }
    {
      await ctx.o.pulls
        .createReview({
          owner: ctx.owner,
          repo: ctx.repo,
          pull_number: f.pr.number,
          event: "APPROVE",
          body: `🧍 G3 aprovado por ${quem(ctx)} no Console da Squad.`,
        })
        .catch(() => undefined);
    }
    await ctx.o.pulls.merge({
      owner: ctx.owner,
      repo: ctx.repo,
      pull_number: f.pr.number,
      merge_method: "squash",
      commit_title: `${feature}: G3 aprovado por ${quem(ctx)} (#${f.pr.number})`,
    });
    revalidatePath(base(ctx));
    return { ok: true, message: "G3 aprovado: PR mesclado na branch principal. O CI/CD segue daqui." };
  } catch (e) {
    return { error: errMsg(e) };
  }
}

// ---------------------------------------------------------------- configuração

export async function saveConfigFile(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await ctxFrom(fd, "configurar");
    const path = str(fd, "path", 200);
    const content = String(fd.get("content") ?? "").replace(/\r\n/g, "\n");
    const motivo = str(fd, "motivo", 200) || `atualiza ${path}`;
    const aplicar = fd.get("aplicar") === "on";
    if (!isEditablePath(path)) return { error: "Este arquivo não pode ser editado pelo console." };
    if (content.length > 200_000) return { error: "Arquivo grande demais." };
    const invalido = validateConfigContent(path, content);
    if (invalido) return { error: invalido };

    const atual = await readFile(ctx.o, ctx.owner, ctx.repo, path, ctx.defaultBranch);
    if (atual && atual.content === content) return { ok: true, message: "Nada mudou." };

    const head = await ctx.o.repos.getBranch({ owner: ctx.owner, repo: ctx.repo, branch: ctx.defaultBranch });
    const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
    const branch = `config/${stamp}-${slugify(path, 30)}`;
    await ctx.o.git.createRef({ owner: ctx.owner, repo: ctx.repo, ref: `refs/heads/${branch}`, sha: head.data.commit.sha });
    await writeFile(ctx.o, {
      owner: ctx.owner,
      repo: ctx.repo,
      path,
      branch,
      sha: atual?.sha,
      content,
      message: `config: ${motivo}`,
    });
    const pr = await ctx.o.pulls.create({
      owner: ctx.owner,
      repo: ctx.repo,
      head: branch,
      base: ctx.defaultBranch,
      title: `config: ${motivo}`,
      body: `Alteração de configuração da squad feita por ${quem(ctx)} no Console da Squad.\n\nArquivo: \`${path}\``,
    });

    if (aplicar) {
      try {
        await ctx.o.pulls.merge({ owner: ctx.owner, repo: ctx.repo, pull_number: pr.data.number, merge_method: "squash" });
        await ctx.o.git.deleteRef({ owner: ctx.owner, repo: ctx.repo, ref: `heads/${branch}` }).catch(() => undefined);
        revalidatePath(`${base(ctx)}/config`);
        return { ok: true, message: "Alteração aplicada na branch principal.", url: pr.data.html_url };
      } catch (e) {
        return {
          ok: true,
          message: `PR aberto, mas não foi possível aplicar agora (${errMsg(e)}). Mescle quando as checagens passarem.`,
          url: pr.data.html_url,
        };
      }
    }
    revalidatePath(`${base(ctx)}/config`);
    return { ok: true, message: "Pull Request de configuração aberto.", url: pr.data.html_url };
  } catch (e) {
    return { error: errMsg(e) };
  }
}

export async function newAgent(_: ActionState, fd: FormData): Promise<ActionState> {
  let destino = "";
  try {
    const ctx = await ctxFrom(fd, "configurar");
    const nome = slugify(str(fd, "nome", 48), 48);
    if (!RE_AGENT.test(nome)) return { error: "Nome inválido. Use letras minúsculas e hífen (ex.: eng-streaming)." };
    const existe = await readFile(ctx.o, ctx.owner, ctx.repo, `.claude/agents/${nome}.md`, ctx.defaultBranch);
    if (existe) return { error: "Já existe um agente com esse nome." };
    destino = `${base(ctx)}/config/edit?path=${encodeURIComponent(`.claude/agents/${nome}.md`)}&novo=1`;
  } catch (e) {
    return { error: errMsg(e) };
  }
  redirect(destino);
}

export async function mergeConfigPR(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await ctxFrom(fd, "configurar");
    const n = Number(fd.get("pr"));
    const pr = (await ctx.o.pulls.get({ owner: ctx.owner, repo: ctx.repo, pull_number: n })).data;
    if (!pr.head.ref.startsWith("config/")) return { error: "Só PRs de configuração podem ser mesclados aqui." };
    await ctx.o.pulls.merge({ owner: ctx.owner, repo: ctx.repo, pull_number: n, merge_method: "squash" });
    await ctx.o.git.deleteRef({ owner: ctx.owner, repo: ctx.repo, ref: `heads/${pr.head.ref}` }).catch(() => undefined);
    revalidatePath(`${base(ctx)}/config`);
    return { ok: true, message: `PR #${n} aplicado.` };
  } catch (e) {
    return { error: errMsg(e) };
  }
}

async function putRepoSecret(ctx: SquadContext, name: string, value: string) {
  const pk = (await ctx.o.actions.getRepoPublicKey({ owner: ctx.owner, repo: ctx.repo })).data;
  await sodium.ready;
  const sealed = sodium.crypto_box_seal(sodium.from_string(value), sodium.from_base64(pk.key, sodium.base64_variants.ORIGINAL));
  await ctx.o.actions.createOrUpdateRepoSecret({
    owner: ctx.owner,
    repo: ctx.repo,
    secret_name: name,
    encrypted_value: sodium.to_base64(sealed, sodium.base64_variants.ORIGINAL),
    key_id: pk.key_id,
  });
}

export async function setApiKey(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await ctxFrom(fd, "configurar");
    const key = String(fd.get("apiKey") ?? "").trim();
    if (!/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(key)) return { error: "Isso não parece uma chave da API da Anthropic (começa com sk-ant-)." };
    await putRepoSecret(ctx, "ANTHROPIC_API_KEY", key);
    revalidatePath(`${base(ctx)}/config`);
    return { ok: true, message: "Chave salva como segredo ANTHROPIC_API_KEY do repositório. O console não guarda a chave." };
  } catch (e) {
    return { error: errMsg(e) };
  }
}

// ---------------------------------------------------------------- Databricks

export type DbxState = ActionState & { checks?: Check[]; salvo?: boolean };

/** Testa a conexão com as credenciais informadas e, se passar, grava segredos e configuração. */
export async function saveDatabricks(_: DbxState, fd: FormData): Promise<DbxState> {
  try {
    const ctx = await ctxFrom(fd, "configurar");
    const somenteTestar = fd.get("intent") === "testar";
    const cfg: DbxConfig = {
      host: normalizeHost(str(fd, "host", 300)),
      warehouseId: str(fd, "warehouse", 80),
      leitura: parseLeitura(str(fd, "leitura", 2000)),
      escrita: str(fd, "escrita", 200).replace(/`/g, "").toLowerCase(),
    };
    const invalido = validateDbxConfig(cfg);
    if (invalido) return { error: invalido };
    const clientId = str(fd, "clientId", 200);
    const secret = String(fd.get("secret") ?? "").trim();
    const jaTemSegredo = (await secretStatus(ctx, "DATABRICKS_CLIENT_SECRET")).set;

    let checks: Check[] | undefined;
    if (clientId && secret) {
      checks = await testConnection(cfg, clientId, secret);
      if (somenteTestar || checks.some((c) => !c.ok)) {
        return checks.some((c) => !c.ok)
          ? { error: "A conexão não passou em todas as checagens. Nada foi salvo.", checks }
          : { ok: true, message: "Conexão OK. Clique em Salvar para gravar.", checks };
      }
    } else if (somenteTestar || !jaTemSegredo) {
      return { error: "Informe o Client ID e o Client secret para testar e salvar." };
    } else if (clientId || secret) {
      return { error: "Para trocar as credenciais, informe Client ID e Client secret juntos." };
    }

    if (clientId && secret) {
      await putRepoSecret(ctx, "DATABRICKS_CLIENT_ID", clientId);
      await putRepoSecret(ctx, "DATABRICKS_CLIENT_SECRET", secret);
    }
    const atual = await readFile(ctx.o, ctx.owner, ctx.repo, ".squad/squad.yaml", ctx.defaultBranch);
    const YAML = await import("yaml");
    const novo = setDatabricksYaml(atual?.content ?? "", cfg, YAML);
    let pr: string | undefined;
    if (novo !== (atual?.content ?? "")) {
      const r = await commitDiretoOuPR(ctx, ".squad/squad.yaml", novo, "acesso ao Databricks");
      if (!r.direto) pr = r.url;
    }
    await (await store()).audit({ actor: ctx.user.email, action: "squad.databricks", target: `${ctx.owner}/${ctx.repo}: ${cfg.host}` });
    revalidatePath(`${base(ctx)}/config`);
    return {
      ok: true,
      salvo: true,
      checks,
      url: pr,
      message: pr
        ? "Credenciais salvas nos segredos do GitHub. A branch principal é protegida: abri um PR com a configuração (host, warehouse, catálogos)."
        : clientId
          ? "Conexão testada e salva. Os agentes já podem consultar o Databricks."
          : "Configuração atualizada (credenciais mantidas).",
    };
  } catch (e) {
    return { error: errMsg(e) };
  }
}

// ---------------------------------------------------------------- nova squad

export async function createSquad(_: ActionState, fd: FormData): Promise<ActionState> {
  let destino = "";
  try {
    const user = await requireUser();
    if (!user.isAdmin) return { error: "Somente administradores do console podem criar squads." };
    const o = await gh();
    const owner = env.githubOrg;
    const nome = slugify(str(fd, "nome", 80), 80);
    const cliente = str(fd, "cliente", 120);
    const descricao = str(fd, "descricao", 300);
    const plataforma = str(fd, "plataforma", 30) || "agnostico";
    const modelo = str(fd, "modelo", 60) || "sonnet";
    if (!RE_NAME.test(nome) || nome.length < 3) return { error: "Nome do repositório inválido (mínimo 3 caracteres: letras, números e hífen)." };
    const [tOwner, tRepo] = env.templateRepo.split("/");
    if (!tOwner || !tRepo) return { error: `SQUAD_TEMPLATE_REPO inválido ("${env.templateRepo}"). Use o formato dono/repositorio.` };

    // ---- pré-checagens: dizem exatamente qual requisito falta ----
    let template;
    try {
      template = (await o.repos.get({ owner: tOwner, repo: tRepo })).data;
    } catch (e) {
      if (status(e) === 404)
        return { error: `O GitHub App não acessa o template ${env.templateRepo}. Confira SQUAD_TEMPLATE_REPO e se o App está instalado com acesso a esse repositório.` };
      throw e;
    }
    if (template.full_name.toLowerCase() !== env.templateRepo.toLowerCase())
      return { error: `O template mudou de endereço: agora é ${template.full_name}. Atualize a variável SQUAD_TEMPLATE_REPO.` };
    if (!template.is_template)
      return { error: `O repositório ${template.full_name} ainda não está marcado como template. No GitHub: Settings → marque "Template repository".` };
    resetAppCache(); // relê as permissões aprovadas na instalação
    const perms = await missingPermissions();
    if (perms.faltando.length)
      return {
        error: `A instalação do GitHub App em ${owner} não tem estas permissões: ${perms.faltando.join(", ")}. Ajuste em Developer settings → GitHub Apps → Edit → Permissions e aprove em ${owner} → Settings → GitHub Apps → Configure (Review request).`,
      };
    if (perms.selecao && perms.selecao !== "all")
      return { error: `O GitHub App está instalado só em repositórios selecionados. Em ${owner} → Settings → GitHub Apps → Configure, escolha "All repositories" para que as squads novas fiquem acessíveis.` };
    const existente = await (await gh()).repos.get({ owner, repo: nome }).then(() => true).catch((e) => (status(e) === 404 ? false : Promise.reject(e)));
    if (existente) return { error: `Já existe um repositório ${owner}/${nome}. Escolha outro nome.` };

    try {
      await o.repos.createUsingTemplate({
        template_owner: tOwner,
        template_repo: tRepo,
        owner,
        name: nome,
        private: true,
        description: descricao || `Squad agêntica de Data Analytics — ${cliente || nome}`,
      });
    } catch (e) {
      console.error("[nova squad] createUsingTemplate:", errDetail(e), e);
      const msg = errMsg(e);
      if (status(e) === 403 || status(e) === 404)
        return { error: `O GitHub App não conseguiu criar repositórios em ${owner}. Confira se o App tem "Administration", "Contents" e "Workflows" como Read and write, aprovadas na instalação, e se está em "All repositories". Detalhe: ${errDetail(e)}` };
      return { error: `Falha ao criar o repositório: ${msg || errDetail(e)}` };
    }

    // a geração a partir do template é assíncrona: espera o conteúdo aparecer
    let squadYaml = null;
    for (let i = 0; i < 15 && !squadYaml; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      squadYaml = await readFile(o, owner, nome, ".squad/squad.yaml").catch(() => null);
    }
    if (!squadYaml) return { error: "Repositório criado, mas o conteúdo do template ainda não apareceu. Abra a lista de squads em instantes." };

    let etapa = "ler o repositório criado";
    try {
      const repoInfo = (await o.repos.get({ owner, repo: nome })).data;
      etapa = "adicionar o tópico";
      await o.repos.replaceAllTopics({ owner, repo: nome, names: [env.topic] });
      const yamlStr = (v: string) => JSON.stringify(v);
      const cfg = [
        "# Configuração da squad — lida pelo Console e pelo workflow squad-agent",
        `nome: ${yamlStr(str(fd, "titulo", 120) || nome)}`,
        `cliente: ${yamlStr(cliente)}`,
        `descricao: ${yamlStr(descricao)}`,
        `plataforma: ${slugify(plataforma, 30)}`,
        `modelo: ${yamlStr(modelo)}`,
        "max_turnos: 60",
        "alerta_custo_usd: 5",
        `console_bot: ${yamlStr(await appBotLogin())}   # bot do GitHub App do Squad Console`,
        "",
      ].join("\n");
      etapa = "gravar .squad/squad.yaml";
      await writeFile(o, {
        owner, repo: nome, path: ".squad/squad.yaml", branch: repoInfo.default_branch,
        sha: squadYaml.sha, content: cfg, message: "config: dados da squad",
      });
      etapa = "gravar .squad/members.yaml";
      const mem = await readFile(o, owner, nome, ".squad/members.yaml");
      await writeFile(o, {
        owner, repo: nome, path: ".squad/members.yaml", branch: repoInfo.default_branch, sha: mem?.sha,
        message: `config: operador inicial (${user.email})`,
        content: serializeMembers({ operadores: [user.email], membros: [], leitores: [] }),
      });
    } catch (e) {
      return { error: `O repositório ${owner}/${nome} foi criado, mas falhou ao ${etapa}: ${errMsg(e)}. Conclua em Configuração ou ajuste direto no GitHub.` };
    }
    await (await store()).audit({ actor: user.email, action: "squad.criar", target: `${owner}/${nome}` });
    destino = `/s/${owner}/${nome}/config?nova=1`;
  } catch (e) {
    return { error: errMsg(e) };
  }
  redirect(destino);
}

// ---------------------------------------------------------------- equipe da squad

async function commitDiretoOuPR(ctx: SquadContext, path: string, content: string, motivo: string) {
  const atual = await readFile(ctx.o, ctx.owner, ctx.repo, path, ctx.defaultBranch);
  try {
    await writeFile(ctx.o, {
      owner: ctx.owner, repo: ctx.repo, path, branch: ctx.defaultBranch, sha: atual?.sha, content,
      message: `config: ${motivo}`,
    });
    return { direto: true as const };
  } catch (e) {
    const s = status(e);
    if (s !== 409 && s !== 422 && s !== 403) throw e;
    // branch protegida: segue pelo caminho do Pull Request
    const head = await ctx.o.repos.getBranch({ owner: ctx.owner, repo: ctx.repo, branch: ctx.defaultBranch });
    const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
    const branch = `config/${stamp}-${slugify(path, 30)}`;
    await ctx.o.git.createRef({ owner: ctx.owner, repo: ctx.repo, ref: `refs/heads/${branch}`, sha: head.data.commit.sha });
    await writeFile(ctx.o, { owner: ctx.owner, repo: ctx.repo, path, branch, sha: atual?.sha, content, message: `config: ${motivo}` });
    const pr = await ctx.o.pulls.create({
      owner: ctx.owner, repo: ctx.repo, head: branch, base: ctx.defaultBranch, title: `config: ${motivo}`,
      body: `Alteração feita por ${quem(ctx)} no Squad Console.\n\nA branch principal é protegida; para alterações de equipe entrarem na hora, adicione o GitHub App do console à lista de bypass do ruleset.`,
    });
    return { direto: false as const, url: pr.data.html_url };
  }
}

/** Adiciona, muda o papel ou remove alguém da squad (por e-mail). */
export async function setSquadMember(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await ctxFrom(fd, "configurar");
    const email = normalizeEmail(String(fd.get("email") ?? ""));
    const papel = String(fd.get("papel") ?? "");
    const role = (["operador", "membro", "leitor"].includes(papel) ? papel : null) as Role | null;
    if (!isValidEmail(email)) return { error: "Informe um e-mail válido." };
    if (papel !== "remover" && !role) return { error: "Escolha o papel." };

    const db = await store();
    let conta = await db.findUserByEmail(email);
    if (!conta && role) {
      if (!ctx.user.isAdmin) return { error: "Este e-mail ainda não tem conta no console. Peça a um administrador para convidá-lo." };
      if (fd.get("convidar") !== "on") return { error: "Este e-mail ainda não tem conta. Marque \"convidar\" para criar a conta e enviar o convite." };
      conta = await db.createUser({ email, name: "", role: "usuario", invitedBy: ctx.user.email });
      await sendInvite(email, "", ctx.user.name).catch((e) => console.error("[convite]", (e as Error).message));
      await db.audit({ actor: ctx.user.email, action: "usuario.convidar", target: `${email} (via ${ctx.owner}/${ctx.repo})` });
    }

    const novo = setMemberRole(ctx.members, email, role);
    if (!novo.operadores.length && !role) {
      const sobra = ctx.members.operadores.filter((x) => x !== email);
      if (!sobra.length) return { error: "A squad precisa de pelo menos um operador." };
    }
    if (!novo.operadores.length) return { error: "A squad precisa de pelo menos um operador." };

    const motivo = role ? `${email} como ${role}` : `remove ${email}`;
    const r = await commitDiretoOuPR(ctx, ".squad/members.yaml", serializeMembers(novo), `equipe — ${motivo}`);
    await db.audit({ actor: ctx.user.email, action: role ? "squad.membro" : "squad.remover_membro", target: `${ctx.owner}/${ctx.repo}: ${motivo}` });
    revalidatePath(`${base(ctx)}/config`);
    return r.direto
      ? { ok: true, message: role ? `${email} agora é ${role} desta squad.` : `${email} saiu da squad.` }
      : { ok: true, message: "A branch principal é protegida: abri um Pull Request com a alteração.", url: r.url };
  } catch (e) {
    return { error: errMsg(e) };
  }
}

// ---------------------------------------------------------------- dúvidas da spec (G1)

/**
 * Salva as respostas do Operador às dúvidas da spec e, se pedido, envia ao analista
 * para reprocessar: incorporar respostas, reavaliar as demais dúvidas e abrir novas.
 */
export async function answerDoubts(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await ctxFrom(fd, "aprovar");
    const feature = str(fd, "feature", 80);
    const enviar = fd.get("intent") === "enviar";
    if (!RE_FEATURE.test(feature)) return { error: "Feature inválida." };

    const prs = await listSquadPRs(ctx);
    const f = await loadFeature(ctx, feature, true, prs);
    if (!f.branch || !f.spec) return { error: "A spec ainda não existe nesta feature." };

    const rodando = (await listRuns(ctx, [], 15)).some((r) => r.feature === feature && isRunning(r));
    if (rodando) return { error: "Um agente está trabalhando nesta feature agora. Aguarde terminar para salvar respostas." };

    const n = Math.min(Number(fd.get("n") ?? 0) || 0, 100);
    const respostas = new Map<string, string>();
    for (let i = 0; i < n; i++) {
      const q = String(fd.get(`q_${i}`) ?? "").trim();
      if (!q) continue;
      respostas.set(q, String(fd.get(`r_${i}`) ?? "").slice(0, 4000));
    }
    const atuais = new Map(parseDoubts(f.spec.body).abertas.map((d) => [d.texto, d.resposta ?? ""]));
    const mudou = new Map([...respostas].filter(([q, r]) => atuais.has(q) && (atuais.get(q) ?? "").trim() !== r.trim()));

    if (mudou.size) {
      const { texto } = applyAnswers(f.spec.raw, mudou, ctx.user.email, todaySaoPaulo());
      await writeFile(ctx.o, {
        owner: ctx.owner,
        repo: ctx.repo,
        path: f.spec.path,
        branch: f.branch,
        sha: f.spec.sha,
        content: texto,
        message: `spec(${feature}): ${mudou.size} resposta(s) do Operador (${ctx.user.email})`,
      });
    }

    if (!enviar) {
      revalidatePath(`${base(ctx)}/f/${feature}`);
      return { ok: true, message: mudou.size ? `${mudou.size} resposta(s) salva(s) na spec.` : "Nada mudou." };
    }

    // estado final das respostas para a instrução
    const finais = new Map(atuais);
    for (const [q, r] of mudou) finais.set(q, r.trim());
    const respondidas = [...finais].filter(([, r]) => r);
    if (!respondidas.length) return { error: "Responda pelo menos uma dúvida antes de enviar ao analista." };
    const pendentes = [...finais].filter(([, r]) => !r).map(([q]) => q);

    const lista = respondidas.map(([q, r], i) => `${i + 1}. Dúvida: ${q}\n   Resposta: ${r.replace(/\n/g, "\n   ")}`).join("\n");
    const instrucao = `O Operador ${quem(ctx)} respondeu ${respondidas.length} dúvida(s) da spec ${feature}. As respostas estão registradas em "Dúvidas abertas" como "Resposta do Operador".

Faça uma rodada de revisão da spec:
1. Para cada dúvida respondida: incorpore a resposta nas regras de negócio, métricas e critérios de aceite; registre a decisão na seção "Decisões" (data, decisão e quem decidiu: ${ctx.user.email}); marque a dúvida como resolvida ("- [x]") ou remova-a de "Dúvidas abertas".
2. Reavalie as dúvidas ainda sem resposta${pendentes.length ? ` (${pendentes.length})` : ""}: se alguma já foi esclarecida pelas respostas, resolva e registre em "Decisões" citando a resposta que a esclareceu.
3. Se as respostas levantarem novas questões ou contradições, adicione novas dúvidas "- [ ]", claras e objetivas.
4. Mantenha status: em_revisao e incremente "versao" no front matter.

Respostas desta rodada:
${lista}`;
    await dispatch(ctx, "analista-requisitos", feature, instrucao);
    await comment(ctx, f.pr?.number, `🧍 ${quem(ctx)} respondeu ${respondidas.length} dúvida(s) da spec e enviou ao analista para reprocessar.`);
    revalidatePath(`${base(ctx)}/f/${feature}`);
    return { ok: true, message: "Respostas enviadas. O analista vai reprocessar a spec; novas dúvidas, se houver, aparecem aqui." };
  } catch (e) {
    return { error: errMsg(e) };
  }
}
