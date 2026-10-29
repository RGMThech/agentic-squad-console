import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { AutoRefresh } from "@/components/AutoRefresh";
import { IconExternal } from "@/components/Icons";
import { Markdown } from "@/components/Markdown";
import { PageHead } from "@/components/Shell";
import { DocBadge, GateTrack, RunIcon } from "@/components/Status";
import { approveG3, approveGate, requestChanges, runAgent } from "@/lib/actions";
import { AGENTES_PADRAO, RE_FEATURE, can, nextStep } from "@/lib/core";
import { ago, money, runDuration, when } from "@/lib/format";
import { listDir } from "@/lib/github";
import { getPRs, getSquad } from "@/lib/page";
import { isRunning, listFeatureIds, listRuns, loadFeature, prChecks, type Doc, type Run } from "@/lib/squad";

const ABAS = [
  { k: "spec", t: "Spec" },
  { k: "design", t: "Design" },
  { k: "tarefas", t: "Tarefas" },
  { k: "qa", t: "QA" },
  { k: "revisao", t: "Revisão" },
  { k: "execucoes", t: "Execuções" },
] as const;

type Params = Promise<{ owner: string; repo: string; feature: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  return { title: (await params).feature };
}

export default async function FeaturePage({ params, searchParams }: { params: Params; searchParams: Promise<{ aba?: string; novo?: string }> }) {
  const { owner, repo, feature } = await params;
  const { aba = "spec", novo } = await searchParams;
  if (!RE_FEATURE.test(feature)) notFound();
  const ctx = await getSquad(owner, repo);
  const prs = await getPRs(owner, repo);
  const b = `/s/${owner}/${repo}`;
  const fb = `${b}/f/${feature}`;

  const [ids, allRuns, agentFiles] = await Promise.all([
    listFeatureIds(ctx),
    listRuns(ctx, prs, 60),
    listDir(ctx.o, owner, repo, ".claude/agents", ctx.defaultBranch),
  ]);
  const runs = allRuns.filter((r) => r.feature === feature);
  const running = runs.filter(isRunning);
  const entry = ids.find((i) => i.id === feature);
  const agentes = agentFiles.filter((f) => f.name.endsWith(".md")).map((f) => f.name.replace(/\.md$/, ""));
  const listaAgentes = agentes.length ? agentes : AGENTES_PADRAO;
  const custo = runs.reduce((s, r) => s + (r.record?.custo_usd ?? 0), 0);

  // Feature recém-pedida: a branch ainda não existe
  if (!entry) {
    if (!runs.length && !novo) notFound();
    return (
      <>
        <AutoRefresh active seconds={8} />
        <PageHead title={feature} crumbs={[{ href: b, label: ctx.config.nome || repo }, { label: feature }]} />
        <div className="content stack">
          <div className="card card-pad stack-sm">
            <span className="badge badge-blue" style={{ alignSelf: "flex-start" }}>
              <span className="dot pulse" /> Preparando a feature
            </span>
            <h2>O analista de requisitos está escrevendo a spec</h2>
            <p className="muted">
              A execução leva alguns minutos. Esta página atualiza sozinha. Quando terminar, a spec aparece aqui com as dúvidas para você responder.
            </p>
          </div>
          <RunsCard runs={runs} />
        </div>
      </>
    );
  }

  const f = await loadFeature(ctx, feature, entry.branch, prs);
  const checks = f.pr && f.pr.state === "open" ? await prChecks(ctx, f.pr.headSha) : null;
  const sugestao = nextStep(f.gates, feature);
  const operador = can(ctx.role, "aprovar");
  const hidden = (
    <>
      <input type="hidden" name="owner" value={owner} />
      <input type="hidden" name="repo" value={repo} />
      <input type="hidden" name="feature" value={feature} />
    </>
  );

  return (
    <>
      <AutoRefresh active={running.length > 0} />
      <PageHead
        title={f.titulo}
        crumbs={[{ href: b, label: ctx.config.nome || repo }, { label: feature }]}
        subtitle={
          <span className="row" style={{ gap: 10 }}>
            <span className="mono xs">{feature}</span>
            {f.spec?.data.versao && <span className="badge">spec v{f.spec.data.versao}</span>}
            {f.pr && (
              <a href={f.pr.url} target="_blank" rel="noreferrer" className="row" style={{ gap: 4 }}>
                PR #{f.pr.number} {f.pr.draft ? "(rascunho)" : ""} <IconExternal size={13} />
              </a>
            )}
            {custo > 0 && <span className="badge">{money(custo)} em execuções</span>}
          </span>
        }
      />
      <div className="content">
        <div className="split">
          <div className="stack">
            <div className="card card-pad">
              <GateTrack gates={f.gates} running={running.length > 0} />
            </div>

            <div className="card">
              <nav className="tabs" aria-label="Artefatos">
                {ABAS.map((a) => (
                  <Link key={a.k} href={`${fb}?aba=${a.k}`} aria-current={aba === a.k ? "page" : undefined}>
                    {a.t}
                    {a.k === "execucoes" && runs.length > 0 && <span className="badge">{runs.length}</span>}
                  </Link>
                ))}
              </nav>
              {aba === "spec" && <DocView doc={f.spec} vazio="A spec ainda não foi criada." />}
              {aba === "design" && <DocView doc={f.design} vazio="O design é criado pelo arquiteto depois do G1." />}
              {aba === "tarefas" &&
                (f.tasks.length ? (
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>ID</th>
                          <th>Tarefa</th>
                          <th>Agente</th>
                          <th className="num">Ciclos QA</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {f.tasks.map((t) => (
                          <tr key={t.id}>
                            <td className="mono xs">{t.id}</td>
                            <td>{t.tarefa}</td>
                            <td className="small">{t.agente}</td>
                            <td className="num">{t.ciclos}</td>
                            <td>
                              <TaskBadge status={t.status} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <DocView doc={f.tasksDoc} vazio="As tarefas são criadas pelo orquestrador depois do G2." />
                ))}
              {aba === "qa" && <DocView doc={f.qa} vazio="Ainda não há relatório de QA." />}
              {aba === "revisao" && <DocView doc={f.review} vazio="Ainda não há parecer do revisor." />}
              {aba === "execucoes" && (
                <div className="card-pad">
                  <RunsList runs={runs} />
                </div>
              )}
            </div>
          </div>

          <aside className="stack">
            {running.length > 0 && (
              <div className="alert alert-info">
                <b>{running.map((r) => r.agente).join(", ")}</b> trabalhando agora. A página atualiza sozinha.
              </div>
            )}

            {/* ---------------- G1 ---------------- */}
            {f.gates.g1 === "aguardando" && (
              <div className="card card-pad stack-sm">
                <span className="badge badge-amber" style={{ alignSelf: "flex-start" }}>G1 · Spec</span>
                {f.doubts.length > 0 ? (
                  <>
                    <h3>O analista tem {f.doubts.length} dúvida(s)</h3>
                    <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
                      {f.doubts.map((d, i) => (
                        <li key={i}>{d}</li>
                      ))}
                    </ul>
                    {operador ? (
                      <ActionForm action={requestChanges} submit="Enviar respostas ao analista" variant="gate" resetOnOk>
                        {hidden}
                        <input type="hidden" name="gate" value="G1" />
                        <textarea name="feedback" className="textarea" required placeholder="Responda cada dúvida, na ordem…" />
                      </ActionForm>
                    ) : (
                      <p className="small muted">Aguardando o operador responder.</p>
                    )}
                  </>
                ) : operador ? (
                  <GateActions gate="G1" hidden={hidden} proximo="arquiteto-dados" />
                ) : (
                  <p className="small muted">Spec pronta. Aguardando aprovação do operador.</p>
                )}
              </div>
            )}

            {/* ---------------- G2 ---------------- */}
            {f.gates.g2 === "aguardando" && (
              <div className="card card-pad stack-sm">
                <span className="badge badge-amber" style={{ alignSelf: "flex-start" }}>G2 · Design</span>
                {operador ? (
                  <GateActions gate="G2" hidden={hidden} proximo="orquestrador" />
                ) : (
                  <p className="small muted">Design pronto. Aguardando aprovação do operador.</p>
                )}
              </div>
            )}

            {/* ---------------- G3 ---------------- */}
            {f.gates.g3 === "aguardando" && (
              <div className="card card-pad stack-sm">
                <span className="badge badge-amber" style={{ alignSelf: "flex-start" }}>G3 · Produção</span>
                <h3>Pronto para produção</h3>
                <div className="row small">
                  QA <DocBadge value={f.qa?.data.veredito} /> Revisor <DocBadge value={f.review?.data.veredito} />
                </div>
                {checks && <ChecksSummary checks={checks} />}
                {operador ? (
                  <>
                    <ActionForm
                      action={approveG3}
                      submit="Aprovar G3 e mesclar"
                      variant="success"
                      block
                      confirm="Aprovar o G3 vai mesclar o PR na branch principal. Confirmar?"
                    >
                      {hidden}
                    </ActionForm>
                    <details>
                      <summary className="small" style={{ cursor: "pointer" }}>Pedir ajustes ao orquestrador</summary>
                      <ActionForm action={requestChanges} submit="Enviar ajustes" variant="default" resetOnOk>
                        {hidden}
                        <input type="hidden" name="gate" value="G3" />
                        <textarea name="feedback" className="textarea" required placeholder="O que precisa mudar antes de ir para produção?" />
                      </ActionForm>
                    </details>
                  </>
                ) : (
                  <p className="small muted">Aguardando aprovação do operador.</p>
                )}
              </div>
            )}

            {f.gates.g3 === "aprovado" && (
              <div className="alert alert-ok">Feature entregue: o PR foi mesclado na branch principal.</div>
            )}

            {/* ---------------- acionar agente ---------------- */}
            {can(ctx.role, "acionar") && f.gates.g3 !== "aprovado" && (
              <div className="card card-pad stack-sm">
                <h3>Acionar um agente</h3>
                <ActionForm action={runAgent} submit="Acionar" pending="Acionando…" variant="primary" resetOnOk={false}>
                  {hidden}
                  <div className="field">
                    <label htmlFor="agente">Agente</label>
                    <select id="agente" name="agente" className="select" defaultValue={sugestao.agente}>
                      {listaAgentes.map((a) => (
                        <option key={a} value={a}>
                          {a}
                          {a === sugestao.agente ? " (sugerido)" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="instrucao">Instrução</label>
                    <textarea id="instrucao" name="instrucao" className="textarea" defaultValue={sugestao.instrucao} required />
                  </div>
                </ActionForm>
              </div>
            )}

            <div className="card card-pad stack-sm small">
              <h3>Detalhes</h3>
              <div className="spread">
                <span className="muted">Branch</span>
                <span className="mono xs">{f.branch ?? ctx.defaultBranch}</span>
              </div>
              {f.spec?.data.solicitante && (
                <div className="spread">
                  <span className="muted">Solicitante</span>
                  <span>{f.spec.data.solicitante}</span>
                </div>
              )}
              {f.spec?.data.aprovado_por && (
                <div className="spread">
                  <span className="muted">G1 por</span>
                  <span>
                    {f.spec.data.aprovado_por} · {f.spec.data.aprovado_em}
                  </span>
                </div>
              )}
              {f.design?.data.aprovado_por && (
                <div className="spread">
                  <span className="muted">G2 por</span>
                  <span>
                    {f.design.data.aprovado_por} · {f.design.data.aprovado_em}
                  </span>
                </div>
              )}
              {checks && (
                <div className="spread">
                  <span className="muted">Checagens</span>
                  <ChecksBadge state={checks.state} />
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}

function GateActions({ gate, hidden, proximo }: { gate: "G1" | "G2"; hidden: React.ReactNode; proximo: string }) {
  return (
    <>
      <h3>{gate === "G1" ? "A spec está pronta para sua aprovação" : "O design está pronto para sua aprovação"}</h3>
      <p className="small muted">Revise o artefato ao lado. Aprovar grava seu login e a data no front matter.</p>
      <ActionForm action={approveGate} submit={`Aprovar ${gate}`} variant="gate" block>
        {hidden}
        <input type="hidden" name="gate" value={gate} />
        <label className="check">
          <input type="checkbox" name="auto" defaultChecked /> Acionar o {proximo} em seguida
        </label>
      </ActionForm>
      <details>
        <summary className="small" style={{ cursor: "pointer" }}>Pedir ajustes</summary>
        <ActionForm action={requestChanges} submit="Enviar ajustes" variant="default" resetOnOk>
          {hidden}
          <input type="hidden" name="gate" value={gate} />
          <textarea name="feedback" className="textarea" required placeholder="O que precisa mudar?" />
        </ActionForm>
      </details>
    </>
  );
}

function DocView({ doc, vazio }: { doc: Doc | null; vazio: string }) {
  if (!doc) return <div className="card-pad muted">{vazio}</div>;
  const chaves = ["status", "versao", "veredito", "aprovado_por", "aprovado_em", "solicitante", "ciclo", "tarefa"];
  const chips = chaves.filter((k) => doc.data[k]).map((k) => [k, doc.data[k]] as const);
  return (
    <>
      {chips.length > 0 && (
        <div className="fm">
          {chips.map(([k, v]) => (
            <span key={k}>
              {k}: <b>{v}</b>
            </span>
          ))}
        </div>
      )}
      <div className="card-pad">
        <Markdown>{doc.body}</Markdown>
      </div>
    </>
  );
}

function TaskBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    aprovado: "badge-green",
    reprovado: "badge-red",
    bloqueado: "badge-red",
    em_qa: "badge-amber",
    em_andamento: "badge-blue",
  };
  return <span className={`badge ${map[status] ?? ""}`}>{status.replace("_", " ") || "—"}</span>;
}

function ChecksBadge({ state }: { state: string }) {
  if (state === "success") return <span className="badge badge-green">passando</span>;
  if (state === "failure") return <span className="badge badge-red">falhando</span>;
  if (state === "pending") return <span className="badge badge-blue">rodando</span>;
  return <span className="badge">sem checagens</span>;
}

function ChecksSummary({ checks }: { checks: Awaited<ReturnType<typeof prChecks>> }) {
  return (
    <div className="stack-sm" style={{ gap: 4 }}>
      {checks.items.map((c) => (
        <a key={c.name + c.url} href={c.url ?? "#"} target="_blank" rel="noreferrer" className="spread small" style={{ color: "inherit" }}>
          <span>{c.name}</span>
          <ChecksBadge state={c.status !== "completed" ? "pending" : c.conclusion === "success" || c.conclusion === "skipped" || c.conclusion === "neutral" ? "success" : "failure"} />
        </a>
      ))}
    </div>
  );
}

function RunsList({ runs }: { runs: Run[] }) {
  if (!runs.length) return <p className="muted">Nenhuma execução registrada ainda.</p>;
  return (
    <div className="timeline">
      {runs.map((r) => (
        <div key={r.id} className="tl-item">
          <RunIcon run={r} />
          <div>
            <div className="row" style={{ gap: 8 }}>
              <b>{r.agente}</b>
              <span className="xs muted">
                {r.ator} · {when(r.createdAt)}
              </span>
            </div>
            <div className="xs muted">
              {r.record ? `${r.record.turnos ?? "—"} turnos · ${runDuration(r.createdAt, r.updatedAt, r.record.duracao_ms)} · validadores ${r.record.validadores ?? "—"}` : isRunning(r) ? `em andamento ${ago(r.createdAt)}` : runDuration(r.createdAt, r.updatedAt)}
            </div>
          </div>
          <div className="stack-sm" style={{ alignItems: "flex-end", gap: 4 }}>
            <span className="small nowrap">{r.record ? money(r.record.custo_usd) : "—"}</span>
            <a href={r.url} target="_blank" rel="noreferrer" className="xs">
              logs ↗
            </a>
          </div>
        </div>
      ))}
    </div>
  );
}

function RunsCard({ runs }: { runs: Run[] }) {
  return (
    <div className="card">
      <div className="card-head">
        <h2>Execuções</h2>
      </div>
      <div className="card-pad">
        <RunsList runs={runs} />
      </div>
    </div>
  );
}
