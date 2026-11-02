import { ActionForm } from "@/components/ActionForm";
import { PageHead } from "@/components/Shell";
import { createFeature } from "@/lib/actions";
import { can } from "@/lib/core";
import { getSquad, type SquadParams } from "@/lib/page";
import { dicasPedido } from "@/lib/tipo";

export const metadata = { title: "Nova feature" };

export default async function NewFeature({ params }: { params: SquadParams }) {
  const { owner, repo } = await params;
  const ctx = await getSquad(owner, repo);
  const b = `/s/${owner}/${repo}`;
  const d = dicasPedido(ctx.tipo.tipo);
  const esp = ctx.tipo.papeis.especificacao;

  return (
    <>
      <PageHead
        title="Nova feature"
        crumbs={[{ href: b, label: ctx.config.nome || repo }, { label: "Nova feature" }]}
        subtitle={`Descreva o pedido. O ${esp} transforma o pedido em ${ctx.tipo.rotulos.g1.toLowerCase()} e lista as dúvidas para você.`}
      />
      <div className="content">
        {!can(ctx.role, "acionar") ? (
          <div className="alert alert-warn">Seu papel nesta squad é leitor. Peça a um operador para incluir você como membro.</div>
        ) : (
          <div className="split">
            <div className="card card-pad">
              <ActionForm action={createFeature} submit={`Enviar ao ${esp}`} pending={`Acionando o ${esp}…`}>
                <input type="hidden" name="owner" value={owner} />
                <input type="hidden" name="repo" value={repo} />
                <div className="field">
                  <label htmlFor="titulo">Título</label>
                  <input id="titulo" name="titulo" className="input" required minLength={4} maxLength={120} placeholder={d.titulo} />
                </div>
                <div className="field">
                  <label htmlFor="problema">Problema ou objetivo</label>
                  <textarea id="problema" name="problema" className="textarea" required minLength={20} placeholder={d.problema} />
                </div>
                <div className="grid grid-2">
                  <div className="field">
                    <label htmlFor="publico">Quem usa</label>
                    <input id="publico" name="publico" className="input" placeholder={d.publico} />
                  </div>
                  <div className="field">
                    <label htmlFor="decisao">{d.decisao.rotulo}</label>
                    <input id="decisao" name="decisao" className="input" placeholder={d.decisao.exemplo} />
                  </div>
                </div>
                <div className="grid grid-2">
                  <div className="field">
                    <label htmlFor="fontes">{d.fontes.rotulo}</label>
                    <input id="fontes" name="fontes" className="input" placeholder={d.fontes.exemplo} />
                  </div>
                  <div className="field">
                    <label htmlFor="sla">Prazo / SLA</label>
                    <input id="sla" name="sla" className="input" placeholder={d.sla} />
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="obs">Observações</label>
                  <textarea id="obs" name="obs" className="textarea" placeholder="Regras que você já sabe, restrições, aprovações necessárias, dados sensíveis envolvidos…" />
                  <span className="hint">Não cole dados reais de clientes aqui. O texto vai para o histórico do GitHub.</span>
                </div>
              </ActionForm>
            </div>
            <div className="card card-pad stack-sm">
              <h3>O que acontece em seguida</h3>
              <ol className="small muted" style={{ paddingLeft: 18, margin: 0 }}>
                <li>O console reserva o próximo número de feature e aciona o <b>{esp}</b>.</li>
                <li>O agente cria <code>specs/NNN-…/spec.md</code> numa branch própria e abre um PR em rascunho.</li>
                <li>Você responde as dúvidas e aprova o <b>G1 · {ctx.tipo.rotulos.g1}</b> aqui no console.</li>
                <li>Com o G1 aprovado, o <b>{ctx.tipo.papeis.design}</b> prepara o <b>G2 · {ctx.tipo.rotulos.g2}</b>.</li>
              </ol>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
