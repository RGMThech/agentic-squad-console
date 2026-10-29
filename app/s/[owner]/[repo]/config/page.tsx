import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { IconBot, IconCheck, IconExternal, IconFile, IconKey, IconUsers, IconX } from "@/components/Icons";
import { PageHead } from "@/components/Shell";
import { RoleBadge } from "@/components/Status";
import { mergeConfigPR, newAgent, setApiKey } from "@/lib/actions";
import { can, parseFrontmatter } from "@/lib/core";
import { ago, when } from "@/lib/format";
import { listDir, readFile, status } from "@/lib/github";
import { getSquad, type SquadParams } from "@/lib/page";
import { apiKeyStatus, listSquadPRs } from "@/lib/squad";

export const metadata = { title: "Configuração" };

export default async function ConfigPage({ params, searchParams }: { params: SquadParams; searchParams: Promise<{ nova?: string }> }) {
  const { owner, repo } = await params;
  const { nova } = await searchParams;
  const ctx = await getSquad(owner, repo);
  const b = `/s/${owner}/${repo}`;
  const operador = can(ctx.role, "configurar");
  const edit = (p: string) => `${b}/config/edit?path=${encodeURIComponent(p)}`;

  const [agentFiles, skillDirs, key, configPRs, workflow, protecao] = await Promise.all([
    listDir(ctx.o, owner, repo, ".claude/agents", ctx.defaultBranch),
    listDir(ctx.o, owner, repo, ".claude/skills", ctx.defaultBranch),
    operador ? apiKeyStatus(ctx) : Promise.resolve(null),
    listSquadPRs(ctx, "config/").then((l) => l.filter((p) => p.state === "open")),
    readFile(ctx.o, owner, repo, ".github/workflows/squad-agent.yml", ctx.defaultBranch),
    ctx.o.repos
      .getBranchProtection({ owner, repo, branch: ctx.defaultBranch })
      .then(() => "ativa" as const)
      .catch((e) => (status(e) === 404 ? ("ausente" as const) : ("desconhecida" as const))),
  ]);

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
        subtitle={operador ? "Toda alteração vira um Pull Request no repositório da squad, com as checagens do harness." : "Somente operadores podem alterar a configuração."}
      />
      <div className="content stack">
        {nova && (
          <div className="alert alert-ok">
            Squad criada. Próximo passo: cadastre a chave da API da Anthropic abaixo e adicione o time.
          </div>
        )}

        <div className="grid grid-3">
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
              <div className="row">
                <IconUsers size={18} />
                <h3>Equipe e papéis</h3>
              </div>
              {operador && (
                <Link href={edit(".squad/members.yaml")} className="btn btn-sm">
                  Editar
                </Link>
              )}
            </div>
            <div className="stack-sm" style={{ gap: 6 }}>
              {membros.map((m) => (
                <div key={m.l + m.r} className="spread small">
                  <span>@{m.l}</span>
                  <RoleBadge role={m.r} />
                </div>
              ))}
              {membros.length === 0 && <p className="small muted">Ninguém listado. Administradores do repositório atuam como operadores.</p>}
            </div>
            <p className="xs muted">Seu papel: {ctx.role} · permissão no GitHub: {ctx.permission}</p>
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
                      @{p.author} · {when(p.updatedAt)}
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
