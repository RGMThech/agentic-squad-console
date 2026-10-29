import Link from "next/link";
import { AutoRefresh } from "@/components/AutoRefresh";
import { PageHead } from "@/components/Shell";
import { RunBadge } from "@/components/Status";
import { money, runDuration, when } from "@/lib/format";
import { getPRs, getSquad, type SquadParams } from "@/lib/page";
import { isRunning, listRuns } from "@/lib/squad";

export const metadata = { title: "Execuções e custos" };

function soma<T>(itens: T[], chave: (t: T) => string, valor: (t: T) => number) {
  const m = new Map<string, { n: number; v: number }>();
  for (const i of itens) {
    const k = chave(i);
    const cur = m.get(k) ?? { n: 0, v: 0 };
    m.set(k, { n: cur.n + 1, v: cur.v + valor(i) });
  }
  return [...m.entries()].sort((a, b) => b[1].v - a[1].v);
}

export default async function RunsPage({ params }: { params: SquadParams }) {
  const { owner, repo } = await params;
  const ctx = await getSquad(owner, repo);
  const prs = await getPRs(owner, repo);
  const runs = await listRuns(ctx, prs, 100);
  const b = `/s/${owner}/${repo}`;
  const alerta = ctx.config.alerta_custo_usd;

  const mes = new Date().toISOString().slice(0, 7);
  const doMes = runs.filter((r) => r.createdAt.startsWith(mes));
  const custoMes = doMes.reduce((s, r) => s + (r.record?.custo_usd ?? 0), 0);
  const custoTotal = runs.reduce((s, r) => s + (r.record?.custo_usd ?? 0), 0);
  const concluidas = runs.filter((r) => r.status === "completed");
  const sucesso = concluidas.filter((r) => r.conclusion === "success").length;
  const porAgente = soma(runs, (r) => r.agente, (r) => r.record?.custo_usd ?? 0);
  const porFeature = soma(runs, (r) => r.feature, (r) => r.record?.custo_usd ?? 0);
  const comCusto = runs.filter((r) => r.record);
  const medio = comCusto.length ? comCusto.reduce((s, r) => s + (r.record?.custo_usd ?? 0), 0) / comCusto.length : 0;

  return (
    <>
      <AutoRefresh active={runs.some(isRunning)} />
      <PageHead
        title="Execuções e custos"
        crumbs={[{ href: b, label: ctx.config.nome || repo }, { label: "Execuções" }]}
        subtitle={`Últimas ${runs.length} execuções do workflow squad-agent · modelo ${ctx.config.modelo} · alerta acima de ${money(alerta)} por execução`}
      />
      <div className="content stack">
        <div className="grid grid-4">
          <div className="card kpi">
            <div className="kpi-label">Custo no mês</div>
            <div className="kpi-value">{money(custoMes)}</div>
            <div className="kpi-hint">{doMes.length} execuções</div>
          </div>
          <div className="card kpi">
            <div className="kpi-label">Custo no período</div>
            <div className="kpi-value">{money(custoTotal)}</div>
            <div className="kpi-hint">{runs.length} execuções listadas</div>
          </div>
          <div className="card kpi">
            <div className="kpi-label">Custo médio</div>
            <div className="kpi-value">{money(medio)}</div>
            <div className="kpi-hint">por execução com registro</div>
          </div>
          <div className="card kpi">
            <div className="kpi-label">Taxa de sucesso</div>
            <div className="kpi-value">{concluidas.length ? Math.round((sucesso / concluidas.length) * 100) : 0}%</div>
            <div className="kpi-hint">{concluidas.length - sucesso} com falha</div>
          </div>
        </div>

        <div className="grid grid-2">
          {[
            { t: "Por agente", d: porAgente, link: false },
            { t: "Por feature", d: porFeature, link: true },
          ].map((bloco) => (
            <section key={bloco.t} className="card">
              <div className="card-head">
                <h2>{bloco.t}</h2>
              </div>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{bloco.link ? "Feature" : "Agente"}</th>
                      <th className="num">Execuções</th>
                      <th className="num">Custo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bloco.d.length === 0 && (
                      <tr>
                        <td colSpan={3} className="muted">Sem dados ainda.</td>
                      </tr>
                    )}
                    {bloco.d.slice(0, 8).map(([k, v]) => (
                      <tr key={k}>
                        <td>{bloco.link ? <Link href={`${b}/f/${k}`}>{k}</Link> : k}</td>
                        <td className="num">{v.n}</td>
                        <td className="num">{money(v.v)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>

        <section className="card">
          <div className="card-head">
            <h2>Histórico</h2>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Agente</th>
                  <th>Feature</th>
                  <th>Acionado por</th>
                  <th>Status</th>
                  <th className="num">Turnos</th>
                  <th className="num">Duração</th>
                  <th className="num">Custo</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {runs.length === 0 && (
                  <tr>
                    <td colSpan={9} className="muted">Nenhuma execução ainda.</td>
                  </tr>
                )}
                {runs.map((r) => {
                  const custo = r.record?.custo_usd ?? 0;
                  return (
                    <tr key={r.id}>
                      <td className="small nowrap">{when(r.createdAt)}</td>
                      <td className="small">{r.agente}</td>
                      <td className="small">
                        <Link href={`${b}/f/${r.feature}`} className="mono xs">{r.feature}</Link>
                      </td>
                      <td className="small">{r.ator}</td>
                      <td>
                        <RunBadge run={r} />
                      </td>
                      <td className="num small">{r.record?.turnos ?? "—"}</td>
                      <td className="num small">{runDuration(r.createdAt, r.updatedAt, r.record?.duracao_ms)}</td>
                      <td className="num small">
                        {r.record ? (
                          custo > alerta ? <span className="badge badge-red">{money(custo)}</span> : money(custo)
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        <a href={r.url} target="_blank" rel="noreferrer" className="xs">
                          logs ↗
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
        <p className="xs muted">
          O custo vem do registro que o workflow grava no PR de cada feature (resultado do Claude Code em modo não interativo). Execuções sem PR aparecem sem custo.
        </p>
      </div>
    </>
  );
}
