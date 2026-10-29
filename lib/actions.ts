"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import sodium from "libsodium-wrappers";
import { env } from "./env";
import { errMsg, readFile, status, writeFile } from "./github";
import { requireUser } from "./session";
import { listFeatureIds, listSquadPRs, loadFeature, loadSquad, prChecks, type SquadContext } from "./squad";
import {
  RE_AGENT,
  RE_FEATURE,
  RE_NAME,
  can,
  isEditablePath,
  nextFeatureId,
  setFrontmatter,
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
      inputs: { agente, feature, instrucao: instrucao.slice(0, MAX_INSTRUCAO) },
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
    const instrucao = `Crie a spec da feature ${feature} (specs/${feature}/spec.md, id ${feature.slice(0, 3)}) a partir deste pedido de @${ctx.user.login}. Liste todas as dúvidas em "Dúvidas abertas" e deixe status: em_revisao.\n\n${pedido}`;
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
      aprovado_por: ctx.user.login,
      aprovado_em: todaySaoPaulo(),
    });
    await writeFile(ctx.o, {
      owner: ctx.owner,
      repo: ctx.repo,
      path: doc.path,
      branch: f.branch,
      sha: doc.sha,
      content: novo,
      message: `gate(${gate}): ${gate === "G1" ? "spec" : "design"} de ${feature} aprovad${gate === "G1" ? "a" : "o"} por @${ctx.user.login}`,
    });
    await comment(ctx, f.pr?.number, `🧍 **${gate} aprovado** por @${ctx.user.login} no Console da Squad.`);

    let extra = "";
    if (auto) {
      const [agente, instrucao] =
        gate === "G1"
          ? ["arquiteto-dados", `A spec de ${feature} foi aprovada no G1 por @${ctx.user.login}. Produza specs/${feature}/design.md, os contratos e ADRs necessários e deixe status: em_revisao.`]
          : ["orquestrador", `Spec e design de ${feature} aprovados (G2 por @${ctx.user.login}). Gere tasks.md e conduza implementação, QA, revisão e documentação até o G3 ficar pronto.`];
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
    await comment(ctx, f.pr?.number, `🧍 **Ajustes solicitados no ${gate}** por @${ctx.user.login}:\n\n${feedback}`);
    await dispatch(
      ctx,
      agente,
      feature,
      `O Operador @${ctx.user.login} pediu ajustes no ${gate} da feature ${feature}. Trate cada ponto, atualize os artefatos e mantenha status: em_revisao.\n\nAjustes solicitados:\n${feedback}`,
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
    if (f.pr.author !== ctx.user.login) {
      await ctx.o.pulls
        .createReview({
          owner: ctx.owner,
          repo: ctx.repo,
          pull_number: f.pr.number,
          event: "APPROVE",
          body: `🧍 G3 aprovado por @${ctx.user.login} no Console da Squad.`,
        })
        .catch(() => undefined);
    }
    await ctx.o.pulls.merge({
      owner: ctx.owner,
      repo: ctx.repo,
      pull_number: f.pr.number,
      merge_method: "squash",
      commit_title: `${feature}: G3 aprovado por @${ctx.user.login} (#${f.pr.number})`,
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
      body: `Alteração de configuração da squad feita por @${ctx.user.login} no Console da Squad.\n\nArquivo: \`${path}\``,
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

export async function setApiKey(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await ctxFrom(fd, "configurar");
    const key = String(fd.get("apiKey") ?? "").trim();
    if (!/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(key)) return { error: "Isso não parece uma chave da API da Anthropic (começa com sk-ant-)." };
    const pk = (await ctx.o.actions.getRepoPublicKey({ owner: ctx.owner, repo: ctx.repo })).data;
    await sodium.ready;
    const sealed = sodium.crypto_box_seal(sodium.from_string(key), sodium.from_base64(pk.key, sodium.base64_variants.ORIGINAL));
    await ctx.o.actions.createOrUpdateRepoSecret({
      owner: ctx.owner,
      repo: ctx.repo,
      secret_name: "ANTHROPIC_API_KEY",
      encrypted_value: sodium.to_base64(sealed, sodium.base64_variants.ORIGINAL),
      key_id: pk.key_id,
    });
    revalidatePath(`${base(ctx)}/config`);
    return { ok: true, message: "Chave salva como segredo ANTHROPIC_API_KEY do repositório. O console não guarda a chave." };
  } catch (e) {
    return { error: errMsg(e) };
  }
}

// ---------------------------------------------------------------- nova squad

export async function createSquad(_: ActionState, fd: FormData): Promise<ActionState> {
  let destino = "";
  try {
    const user = await requireUser();
    const o = (await import("./github")).gh(user.token);
    const owner = str(fd, "owner", 100);
    const nome = slugify(str(fd, "nome", 80), 80);
    const cliente = str(fd, "cliente", 120);
    const descricao = str(fd, "descricao", 300);
    const plataforma = str(fd, "plataforma", 30) || "agnostico";
    const modelo = str(fd, "modelo", 60) || "sonnet";
    if (!RE_NAME.test(owner) || !RE_NAME.test(nome)) return { error: "Dono ou nome do repositório inválido." };
    const [tOwner, tRepo] = env.templateRepo.split("/");
    if (!tOwner || !tRepo) return { error: `SQUAD_TEMPLATE_REPO inválido ("${env.templateRepo}"). Use o formato dono/repositorio.` };

    // ---- pré-checagens: dizem exatamente qual requisito falta ----
    let template;
    try {
      template = (await o.repos.get({ owner: tOwner, repo: tRepo })).data;
    } catch (e) {
      if (status(e) === 404)
        return {
          error: `Não consigo acessar o template ${env.templateRepo}. Confira a variável SQUAD_TEMPLATE_REPO e se sua conta tem acesso a esse repositório.`,
        };
      throw e;
    }
    if (template.full_name.toLowerCase() !== env.templateRepo.toLowerCase())
      return {
        error: `O template mudou de endereço: agora é ${template.full_name}. Atualize a variável SQUAD_TEMPLATE_REPO para esse valor.`,
      };
    if (!template.is_template)
      return {
        error: `O repositório ${template.full_name} ainda não está marcado como template. No GitHub: Settings → marque "Template repository" e tente de novo.`,
      };

    if (owner.toLowerCase() !== user.login.toLowerCase()) {
      try {
        const m = (await o.orgs.getMembershipForAuthenticatedUser({ org: owner })).data;
        if (m.state !== "active") return { error: `Seu convite para a organização ${owner} ainda está pendente no GitHub.` };
      } catch (e) {
        if (status(e) === 404 || status(e) === 403)
          return {
            error: `O console não tem acesso à organização ${owner}. Saia, entre de novo e, na tela de autorização do GitHub, clique em "Grant" ao lado de ${owner} (ou aprove o OAuth App em Settings → Third-party access da organização).`,
          };
        throw e;
      }
    }

    const existente = await o.repos.get({ owner, repo: nome }).then(() => true).catch((e) => (status(e) === 404 ? false : Promise.reject(e)));
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
      const msg = errMsg(e);
      if (status(e) === 422 && /template/i.test(msg))
        return { error: `O repositório ${env.templateRepo} não está marcado como Template no GitHub (Settings → Template repository).` };
      if (status(e) === 404 || status(e) === 403)
        return { error: `O GitHub não deixou criar ${owner}/${nome}. Verifique se você pode criar repositórios em ${owner} (permissão de membro da organização). Detalhe: ${msg}` };
      return { error: `Falha ao criar o repositório: ${msg}` };
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
      message: "config: operador inicial",
      content: `# Papéis na squad (logins do GitHub). Veja AGENTS.md.\noperadores:\n  - ${user.login}\nmembros: []\nleitores: []\n`,
    });
    } catch (e) {
      return {
        error: `O repositório ${owner}/${nome} foi criado, mas falhou ao ${etapa}: ${errMsg(e)}. Conclua em Configuração ou ajuste direto no GitHub.`,
      };
    }
    destino = `/s/${owner}/${nome}/config?nova=1`;
  } catch (e) {
    return { error: errMsg(e) };
  }
  redirect(destino);
}
