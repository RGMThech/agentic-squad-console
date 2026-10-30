import Link from "next/link";
import { AutoRefresh } from "@/components/AutoRefresh";
import { IconExternal, IconPlus } from "@/components/Icons";
import { PageHead } from "@/components/Shell";
import { GatesMini, RoleBadge, RunBadge } from "@/components/Status";
import { can } from "@/lib/core";
import { SituacaoBadge } from "@/components/Situacao";
import { ago, money } from "@/lib/format";
import { getPRs, getSquad, type SquadParams } from "@/lib/page";
import { isRunning, listFeatures, listRuns, situacaoDaFeature } from "@/lib/squad";

export const metadata = { title: "Visão geral" };

export default async function Overview({ params }: { params: SquadParams }) {
  const { owner, repo } = await params;
  const ctx = await getSquad(owner, repo);
  const prs = await getPRs(owner, repo);
  const [features, runs] = await Promise.all([listFeatures(ctx, prs), listRuns(ctx, prs, 50)]);
  const b = `/s/${owner}/${repo}`;

  const ativas = features.filter((f) => f.gates.g3 !== "aprovado");
  const situacoes = new Map(features.map((f) => [f.id, situacaoDaFeature(f, runs)]));
  const aguardando = ativas.filter((f) => ["voce", "erro"].includes(situacoes.get(f.id)!.tipo));
  const rodando = runs.filter(isRunning);
  const novas = rodando.filter((r, i, all) => !features.some((f) => f.id === r.feature) && all.findIndex((x) => x.feature === r.feature) === i);
  const mes = new Date().toISOString().slice(0, 7);
  const custoMes = runs.filter((r) => r.createdAt.startsWith(mes)).reduce((s, r) => s + (r.record?.custo_usd ?? 0), 0);
  const ultimaPorFeature = new Map<string, (typeof runs)[number]>();
  for (const r of runs) if (!ultimaPorFeature.has(r.feature)) ultimaPorFeature.set(r.feature, r);

  return (
    <>
      <AutoRefresh active seconds={rodando.length > 0 ? 10 : 45} />
      <PageHead
        title={ctx.config.nome || repo}
        subtitle={
          <span className="row" style={{ gap: 8 }}>
            <RoleBadge role={ctx.role} />
            <span>{ctx.config.descricao || "Squad agêntica de Data Analytics"}</span>
            <a href={ctx.htmlUrl} target="_blank" rel="noreferrer" className="row" style={{ gap: 4 }}>
              {owner}/{repo} <IconExternal size={13} />
            </a>
          </span>
        }
        actions={
          can(ctx.role, "acionar") && (
            <Link href={`${b}/features/new`} className="btn btn-primary">
              <IconPlus size={16} /> Nova feature
            </Link>
          )
        }
      />
      <div className="content stack">
        <div className="grid grid-4">
          <div className={`card kpi ${aguardando.length && ctx.role === "operador" ? "attention" : ""}`}>
            <div className="kpi-label">Precisam de você</div>
            <div className="kpi-value">{aguardando.length}</div>
            <div className="kpi-hint">{aguardando.length ? "features paradas esperando decisão ou ação" : "nada parado esperando você"}</div>
          </div>
          <div className="card kpi">
            <div className="kpi-label">Features ativas</div>
            <div className="kpi-value">{ativas.length}</div>
            <div className="kpi-hint">{features.length - ativas.length} entregue(s)</div>
          </div>
          <div className="card kpi">
            <div className="kpi-label">Agentes rodando</div>
            <div className="kpi-value">{rodando.length}</div>
            <div className="kpi-hint">{rodando.length ? rodando.map((r) => r.agente).join(", ") : "nenhuma execução agora"}</div>
          </div>
          <div className="card kpi">
            <div className="kpi-label">Custo no mês</div>
            <div className="kpi-value">{money(custoMes)}</div>
            <div className="kpi-hint">execuções registradas</div>
          </div>
        </div>

        <section className="card">
          <div className="card-head">
            <h2>Features</h2>
            <span className="muted small">G1 spec · G2 design · G3 produção</span>
          </div>
          {features.length === 0 && novas.length === 0 ? (
            <div className="empty">
              <p className="muted" style={{ marginBottom: 16 }}>Nenhuma feature ainda.</p>
              {can(ctx.role, "acionar") && (
                <Link href={`${b}/features/new`} className="btn btn-primary">
                  Abrir a primeira feature
                </Link>
              )}
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Feature</th>
                    <th>Gates</th>
                    <th>Situação</th>
                    <th>Tarefas</th>
                    <th>Última execução</th>
                  </tr>
                </thead>
                <tbody>
                  {novas.map((r) => (
                    <tr key={`novo-${r.id}`}>
                      <td>
                        <Link href={`${b}/f/${r.feature}`} className="feature-title">
                          {r.feature.slice(4).replace(/-/g, " ")}
                        </Link>
                        <div className="xs muted mono">{r.feature}</div>
                      </td>
                      <td>
                        <GatesMini gates={{ g1: "pendente", g2: "nao_iniciado", g3: "nao_iniciado" }} />
                      </td>
                      <td>
                        <span className="badge badge-blue">
                          <span className="dot pulse" /> Analista escrevendo a spec
                        </span>
                      </td>
                      <td>
                        <span className="xs muted">—</span>
                      </td>
                      <td>
                        <RunBadge run={r} />
                      </td>
                    </tr>
                  ))}
                  {features.map((f) => {
                    const sit = situacoes.get(f.id)!;
                    const feitas = f.tasks.filter((t) => t.status === "aprovado").length;
                    const ultima = ultimaPorFeature.get(f.id);
                    return (
                      <tr key={f.id} className="clickable">
                        <td>
                          <Link href={`${b}/f/${f.id}`} className="feature-title">
                            {f.titulo}
                          </Link>
                          <div className="xs muted mono">{f.id}</div>
                        </td>
                        <td>
                          <GatesMini gates={f.gates} />
                        </td>
                        <td>
                          <SituacaoBadge s={sit} />
                        </td>
                        <td>
                          {f.tasks.length ? (
                            <div className="row" style={{ gap: 8 }}>
                              <div className="progress" aria-label={`${feitas} de ${f.tasks.length}`}>
                                <span style={{ width: `${(feitas / f.tasks.length) * 100}%` }} />
                              </div>
                              <span className="xs muted">
                                {feitas}/{f.tasks.length}
                              </span>
                            </div>
                          ) : (
                            <span className="xs muted">—</span>
                          )}
                        </td>
                        <td>
                          {ultima ? (
                            <div className="stack-sm" style={{ gap: 2 }}>
                              <RunBadge run={ultima} />
                              <span className="xs muted">
                                {ultima.agente} · {ago(ultima.createdAt)}
                              </span>
                            </div>
                          ) : (
                            <span className="xs muted">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
