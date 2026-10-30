import { PageHead } from "@/components/Shell";
import { store } from "@/lib/db";
import { when } from "@/lib/format";
import { requireAdmin } from "@/lib/session";

export const metadata = { title: "Auditoria" };

const ROTULO: Record<string, string> = {
  "login.sucesso": "Entrou",
  "login.codigo_enviado": "Pediu código",
  "login.codigo_negado": "Pediu código (sem acesso)",
  "login.codigo_errado": "Errou o código",
  "usuario.convidar": "Convidou",
  "usuario.reenviar_convite": "Reenviou convite",
  "usuario.desativar": "Desativou conta",
  "usuario.reativar": "Reativou conta",
  "usuario.papel": "Mudou papel",
  "usuario.encerrar_sessoes": "Encerrou sessões",
  "usuario.bootstrap_admin": "Conta de administrador inicial criada",
  "squad.criar": "Criou squad",
  "squad.membro": "Alterou equipe",
  "squad.remover_membro": "Removeu da equipe",
  "squad.databricks": "Configurou acesso a dados",
  "squad.dados": "Configurou acesso a dados",
  erro: "Erro no servidor",
};

export default async function AuditoriaPage() {
  await requireAdmin();
  const eventos = await (await store()).listAudit(200);
  const alerta = (a: string) => a === "login.codigo_negado" || a === "login.codigo_errado";
  const grave = (a: string) => a === "erro";

  return (
    <>
      <PageHead title="Auditoria" subtitle="Últimos 200 eventos de acesso e administração. Ações sobre as squads também ficam no histórico do GitHub." />
      <div className="content">
        <section className="card">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Quem</th>
                  <th>Evento</th>
                  <th>Alvo</th>
                </tr>
              </thead>
              <tbody>
                {eventos.length === 0 && (
                  <tr>
                    <td colSpan={4} className="muted">Nenhum evento ainda.</td>
                  </tr>
                )}
                {eventos.map((e, i) => (
                  <tr key={i}>
                    <td className="small nowrap">{when(e.at.toISOString())}</td>
                    <td className="small">{e.actor}</td>
                    <td>{grave(e.action) ? <span className="badge badge-red">{ROTULO[e.action]}</span> : alerta(e.action) ? <span className="badge badge-amber">{ROTULO[e.action] ?? e.action}</span> : <span className="small">{ROTULO[e.action] ?? e.action}</span>}</td>
                    <td className={`small muted${grave(e.action) ? " mono xs wrap-any" : ""}`}>{e.target ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
