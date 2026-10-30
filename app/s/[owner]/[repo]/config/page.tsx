import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { IconBot, IconCheck, IconExternal, IconFile, IconKey, IconUsers, IconX } from "@/components/Icons";
import { PageHead } from "@/components/Shell";
import { RoleBadge } from "@/components/Status";
import { mergeConfigPR, newAgent, setApiKey, setSquadMember } from "@/lib/actions";
import { store } from "@/lib/db";
import { can, parseFrontmatter } from "@/lib/core";
import { ago, when } from "@/lib/format";
import { appBotLogin, listDir, readFile, status, type GH } from "@/lib/github";
import { getSquad, type SquadParams } from "@/lib/page";
import { apiKeyStatus, listSquadPRs, secretStatus } from "@/lib/squad";
import { DadosCard } from "@/components/DadosCard";
import { TODOS_SEGREDOS } from "@/lib/dados-meta";

export const metadata = { title: "Configuração" };

export default async function ConfigPage({ params, searchParams }: { params: SquadParams; searchParams: Promise<{ nova?: string }> }) {
  const { owner, repo } = await params;
  const { nova } = await searchParams;
  const ctx = await getSquad(owner, repo);
  const b = `/s/${owner}/${repo}`;
  const operador = can(ctx.role, "configurar");
  const edit = (p: string) => `${b}/config/edit?path=${encodeURIComponent(p)}`;

  const [agentFiles, skillDirs, key, configPRs, workflow, protecao, usuarios, bot, segredosDados] = await Promise.all([
    listDir(ctx.o, owner, repo, ".claude/agents", ctx.defaultBranch),
    listDir(ctx.o, owner, repo, ".claude/skills", ctx.defaultBranch),
    operador ? apiKeyStatus(ctx) : Promise.resolve(null),
    listSquadPRs(ctx, "config/").then((l) => l.filter((p) => p.state === "open")),
    readFile(ctx.o, owner, repo, ".github/workflows/squad-agent.yml", ctx.defaultBranch),
    protecaoDaBranch(ctx.o, owner, repo, ctx.defaultBranch),
    store().then((s) => s.listUsers()),
    appBotLogin(),
    operador
      ? Promise.all(TODOS_SEGREDOS.map((n) => secretStatus(ctx, n).then((x) => [n, x.set] as const).catch(() => [n, false] as const))).then(Object.fromEntries)
      : Promise.resolve({} as Record<string, boolean>),
  ]);
  const contas = new Map(usuarios.map((u) => [u.email, u]));

  const agentes = await Promise.all(
    agentFiles
      .filter((f) => f.name.endsWith(".md"))
      .map(async (f) => {
        const c = await readFile(ctx.o, owner, repo, f.path, ctx.defaultBranch);
        const { data } = parseFrontmatter(c?.content ?? "");
        return { nome: f.name.replace(/\.md$/, ""), path: f.path, descricao: data.description ?? "", tools: data.tools ?? "" };
      }),
  );

  const membros = [
    ...ctx.members.operadores.map((l) => ({ l, r: "operador" as const })),
    ...ctx.members.membros.map((l) => ({ l, r: "membro" as const })),
    ...ctx.members.leitores.map((l) => ({ l, r: "leitor" as const })),
  ];

  return (
    <>
      <PageHead
        title="Configuração da squad"
        crumbs={[{ href: b, label: ctx.config.nome || repo }, { label: "Configuração" }]}
        subtitle={operador ? "Alterações de agentes, constituição e skills viram Pull Request no repositório da squad, com as checagens do harness." : "Somente operadores podem alterar a configuração."}
      />
      <div className="content stack">
        {nova && (
          <div className="alert alert-ok">
            Squad criada. Próximos passos: cadastre a chave da API da Anthropic e monte a equipe abaixo.
          </div>
        )}

        <div className="grid grid-2">
          <div className="card card-pad stack-sm">
            <div className="row">
              <IconKey size={18} />
              <h3>Chave da API da Anthropic</h3>
            </div>
            {!operador ? (
              <p className="small muted">Visível só para operadores.</p>
            ) : (
              <>
                <p className="small">
                  {key?.set ? (
                    <span className="badge badge-green">Configurada · {ago(key.updatedAt)}</span>
                  ) : (
                    <span className="badge badge-red">Não configurada — os agentes não rodam</span>
                  )}
                </p>
                <ActionForm action={setApiKey} submit={key?.set ? "Substituir chave" : "Salvar chave"} variant="primary" resetOnOk>
                  <input type="hidden" name="owner" value={owner} />
                  <input type="hidden" name="repo" value={repo} />
                  <input name="apiKey" type="password" className="input mono" placeholder="sk-ant-…" autoComplete="off" required />
                  <span className="hint xs muted">
                    Vai direto para os segredos do GitHub Actions (criptografada). O console não armazena a chave.
                  </span>
                </ActionForm>
              </>
            )}
          </div>

          <div className="card card-pad stack-sm">
            <div className="spread">
              <h3>Squad</h3>
              {operador && (
                <Link href={edit(".squad/squad.yaml")} className="btn btn-sm">
                  Editar
                </Link>
              )}
            </div>
            {[
              ["Nome", ctx.config.nome],
              ["Cliente", ctx.config.cliente || "—"],
              ["Plataforma", ctx.config.plataforma],
              ["Modelo", ctx.config.modelo],
              ["Máx. turnos", String(ctx.config.max_turnos)],
              ["Alerta de custo", `US$ ${ctx.config.alerta_custo_usd}`],
            ].map(([k, v]) => (
              <div key={k} className="spread small">
                <span className="muted">{k}</span>
                <span>{v}</span>
              </div>
            ))}
          </div>
        </div>

        <DadosCard owner={owner} repo={repo} atual={ctx.config.dados} plataformaSquad={ctx.config.plataforma} dbtPedido={ctx.config.dbt} segredos={segredosDados} podeEditar={operador} />

        <section className="card">
          <div className="card-head">
            <div className="row">
              <IconUsers size={18} />
              <h2>Equipe e papéis</h2>
              <span className="badge">{membros.length}</span>
            </div>
            <span className="muted small">Seu papel: {ctx.role}{ctx.user.isAdmin ? " (administrador do console)" : ""}</span>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Pessoa</th>
                  <th>Papel na squad</th>
                  {operador && <th></th>}
                </tr>
              </thead>
              <tbody>
                {membros.length === 0 && (
                  <tr>
                    <td colSpan={3} className="muted small">Ninguém na equipe ainda. Administradores do console atuam como operadores.</td>
                  </tr>
                )}
                {membros.map((m) => {
                  const conta = contas.get(m.l);
                  const hidden = (
                    <>
                      <input type="hidden" name="owner" value={owner} />
                      <input type="hidden" name="repo" value={repo} />
                      <input type="hidden" name="email" value={m.l} />
                    </>
                  );
                  return (
                    <tr key={m.l + m.r}>
                      <td>
                        <div className="feature-title">{conta?.name || m.l}</div>
                        <div className="xs muted">
                          {conta?.name ? m.l : ""}
                          {!m.l.includes("@") ? " · login do GitHub (disparo manual)" : !conta ? " · sem conta no console" : conta.status !== "ativo" ? " · conta desativada" : ""}
                        </div>
                      </td>
                      <td>
                        {operador ? (
                          <ActionForm action={setSquadMember} submit="Salvar" variant="default" className="row inline-form">
                            {hidden}
                            <select name="papel" className="select select-sm" defaultValue={m.r} aria-label={`Papel de ${m.l}`}>
                              <option value="operador">Operador</option>
                              <option value="membro">Membro</option>
                              <option value="leitor">Leitor</option>
                            </select>
                          </ActionForm>
                        ) : (
                          <RoleBadge role={m.r} />
                        )}
                      </td>
                      {operador && (
                        <td>
                          <ActionForm action={setSquadMember} submit="Remover" variant="danger" className="row inline-form" confirm={`Remover ${m.l} da squad?`}>
                            {hidden}
                            <input type="hidden" name="papel" value="remover" />
                          </ActionForm>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {operador && (
            <div className="card-pad" style={{ borderTop: "1px solid var(--line)" }}>
              <ActionForm action={setSquadMember} submit="Adicionar à equipe" resetOnOk className="form team-add">
                <input type="hidden" name="owner" value={owner} />
                <input type="hidden" name="repo" value={repo} />
                <div className="field">
                  <label htmlFor="tm-email">E-mail</label>
                  <input id="tm-email" name="email" type="email" className="input" required list="contas-console" placeholder="pessoa@empresa.com.br" />
                  <datalist id="contas-console">
                    {[...contas.values()].filter((c) => c.status === "ativo" && !membros.some((m) => m.l === c.email)).map((c) => (
                      <option key={c.email} value={c.email}>{c.name}</option>
                    ))}
                  </datalist>
                </div>
                <div className="field">
                  <label htmlFor="tm-papel">Papel</label>
                  <select id="tm-papel" name="papel" className="select" defaultValue="membro">
                    <option value="operador">Operador — aprova gates e configura</option>
                    <option value="membro">Membro — abre features e aciona agentes</option>
                    <option value="leitor">Leitor — só visualiza</option>
                  </select>
                </div>
                {ctx.user.isAdmin && (
                  <label className="check">
                    <input type="checkbox" name="convidar" defaultChecked /> Se ainda não tiver conta, convidar para o console
                  </label>
                )}
              </ActionForm>
            </div>
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <div className="row">
              <IconBot size={18} />
              <h2>Agentes</h2>
              <span className="badge">{agentes.length}</span>
            </div>
            {operador && (
              <ActionForm action={newAgent} submit="Criar agente" variant="default" className="row">
                <input type="hidden" name="owner" value={owner} />
                <input type="hidden" name="repo" value={repo} />
                <input name="nome" className="input" placeholder="eng-streaming" style={{ width: 200 }} required />
              </ActionForm>
            )}
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Agente</th>
                  <th>Quando usar</th>
                  <th>Ferramentas</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {agentes.map((a) => (
                  <tr key={a.nome}>
                    <td className="mono small nowrap">{a.nome}</td>
                    <td className="small muted" style={{ maxWidth: 520 }}>{a.descricao}</td>
                    <td className="xs">{a.tools}</td>
                    <td>
                      <Link href={edit(a.path)} className="btn btn-sm">
                        {operador ? "Editar" : "Ver"}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="grid grid-2">
          <section className="card card-pad stack-sm">
            <div className="row">
              <IconFile size={18} />
              <h2>Constituição e convenções</h2>
            </div>
            {[
              ["AGENTS.md", "Constituição da squad: gates, papéis, regras e definição de pronto"],
              ["CLAUDE.md", "Ponteiro lido pelos agentes ao iniciar"],
              ["docs/naming-convention.md", "Convenção de nomes completa"],
              ...skillDirs.filter((d) => d.type === "dir").map((d) => [`${d.path}/SKILL.md`, `Skill ${d.name}`]),
            ].map(([p, d]) => (
              <Link key={p} href={edit(p)} className="spread small" style={{ color: "inherit", padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
                <span>
                  <span className="mono xs">{p}</span>
                  <div className="xs muted">{d}</div>
                </span>
                <span className="xs">{operador ? "Editar" : "Ver"} →</span>
              </Link>
            ))}
          </section>

          <section className="stack">
            <div className="card card-pad stack-sm">
              <h2>Saúde da instalação</h2>
              <Health
                ok={ctx.config.console_bot.toLowerCase() === bot.toLowerCase()}
                t="Bot do console em .squad/squad.yaml"
                d={ctx.config.console_bot.toLowerCase() === bot.toLowerCase() ? bot : `ajuste console_bot para ${bot} — sem isso, execuções pedidas pelo console são recusadas`}
              />
              <Health ok={Boolean(workflow)} t="Workflow squad-agent" d={workflow ? "presente na branch principal" : "ausente: atualize a partir do template"} />
              <Health ok={protecao === "ativa"} t="Proteção da branch principal" d={protecao === "ativa" ? "ativa" : protecao === "ausente" ? "ausente: exija PR e a checagem squad-gates" : "não foi possível verificar"} />
              {operador && <Health ok={Boolean(key?.set)} t="Chave da API" d={key?.set ? "configurada" : "pendente"} />}
              <a href={`${ctx.htmlUrl}/settings/branches`} target="_blank" rel="noreferrer" className="xs row" style={{ gap: 4 }}>
                Configurações do repositório no GitHub <IconExternal size={12} />
              </a>
            </div>

            <div className="card card-pad stack-sm">
              <h2>Alterações pendentes</h2>
              {configPRs.length === 0 && <p className="small muted">Nenhum PR de configuração aberto.</p>}
              {configPRs.map((p) => (
                <div key={p.number} className="spread small">
                  <a href={p.url} target="_blank" rel="noreferrer">
                    #{p.number} {p.title}
                    <div className="xs muted">
                      {p.author} · {when(p.updatedAt)}
                    </div>
                  </a>
                  {operador && (
                    <ActionForm action={mergeConfigPR} submit="Aplicar" variant="default" className="row">
                      <input type="hidden" name="owner" value={owner} />
                      <input type="hidden" name="repo" value={repo} />
                      <input type="hidden" name="pr" value={p.number} />
                    </ActionForm>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

/** Proteção por ruleset (formato atual) ou por branch protection rule (formato clássico). */
async function protecaoDaBranch(o: GH, owner: string, repo: string, branch: string): Promise<"ativa" | "ausente" | "desconhecida"> {
  const regras = await o.repos
    .getBranchRules({ owner, repo, branch })
    .then((r) => r.data.map((x) => x.type))
    .catch(() => null);
  if (regras?.includes("pull_request")) return "ativa";
  return o.repos
    .getBranchProtection({ owner, repo, branch })
    .then(() => "ativa" as const)
    .catch((e) => (status(e) === 404 ? ("ausente" as const) : regras ? ("ausente" as const) : ("desconhecida" as const)));
}

function Health({ ok, t, d }: { ok: boolean; t: string; d: string }) {
  return (
    <div className="row small" style={{ alignItems: "flex-start" }}>
      <span className={`tl-icon ${ok ? "ok" : "bad"}`}>{ok ? <IconCheck size={13} /> : <IconX size={13} />}</span>
      <div>
        <b>{t}</b>
        <div className="xs muted">{d}</div>
      </div>
    </div>
  );
}
