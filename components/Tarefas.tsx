import { ActionForm } from "@/components/ActionForm";
import { atualizarDocumentacao, decidirTarefa } from "@/lib/actions";
import { ROTULO_STATUS, STATUS_FINAL, type Task } from "@/lib/core";

export function TaskBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    aprovado: "badge-green",
    resolvido_fora: "badge-green",
    nao_executar: "",
    reprovado: "badge-red",
    bloqueado: "badge-red",
    em_qa: "badge-amber",
    em_andamento: "badge-blue",
  };
  return <span className={`badge ${map[status] ?? ""} nowrap`}>{ROTULO_STATUS[status] ?? (status || "—")}</span>;
}

type Props = { tasks: Task[]; hidden: React.ReactNode; podeDecidir: boolean; motivoBloqueio?: string };

/** Tabela de tarefas com as decisões do Operador: reexecutar, não executar, resolvida de outra forma, reabrir. */
export function TarefasView({ tasks, hidden, podeDecidir, motivoBloqueio }: Props) {
  const encerradas = tasks.filter((t) => STATUS_FINAL.includes(t.status)).length;
  return (
    <div className="stack-sm">
      <div className="card-pad tarefas-topo">
        <div>
          <b>
            {encerradas} de {tasks.length} tarefas encerradas
          </b>
          <div className="xs muted">Encerrada = concluída, não será executada ou resolvida de outra forma. O G3 só libera com todas encerradas.</div>
        </div>
        {podeDecidir && (
          <ActionForm action={atualizarDocumentacao} submit="Atualizar documentação" variant="default" className="form">
            {hidden}
          </ActionForm>
        )}
      </div>
      {motivoBloqueio && <div className="card-pad xs muted">{motivoBloqueio}</div>}
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
            {tasks.map((t) => (
              <tr key={t.id}>
                <td className="mono xs nowrap">{t.id}</td>
                <td>
                  {t.tarefa}
                  {podeDecidir && (
                    <details className="tarefa-decidir">
                      <summary className="xs">Decidir sobre {t.id}</summary>
                      <ActionForm action={decidirTarefa} submit="Registrar decisão" variant="primary" resetOnOk>
                        {hidden}
                        <input type="hidden" name="tarefa" value={t.id} />
                        <div className="field">
                          <label htmlFor={`int-${t.id}`}>O que fazer</label>
                          <select id={`int-${t.id}`} name="intent" className="select" defaultValue={STATUS_FINAL.includes(t.status) ? "reexecutar" : "reexecutar"}>
                            <option value="reexecutar">Reexecutar (o orquestrador refaz com a sua orientação)</option>
                            <option value="nao_executar">Não será executada</option>
                            <option value="resolvido_fora">Resolvida de outra forma</option>
                            {STATUS_FINAL.includes(t.status) && <option value="pendente">Reabrir (voltar para pendente, sem acionar agente)</option>}
                          </select>
                        </div>
                        <textarea name="justificativa" className="textarea" rows={3} placeholder="Reexecutar: o que corrigir. Não executar / resolvida fora: motivo ou como foi resolvida (vai para a documentação)." />
                        <label className="check xs">
                          <input type="checkbox" name="docs" defaultChecked /> Atualizar a documentação da entrega com esta decisão
                        </label>
                      </ActionForm>
                    </details>
                  )}
                </td>
                <td className="small">{t.agente}</td>
                <td className="num">{t.ciclos}</td>
                <td>
                  <TaskBadge status={t.status} />
                  {t.nota && <div className="xs muted tarefa-nota">{t.nota}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
