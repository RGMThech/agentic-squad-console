import type { Situacao } from "@/lib/core";
import { ago } from "@/lib/format";
import type { Run } from "@/lib/squad";
import { IconCheck, IconClock, IconGate, IconX } from "./Icons";
import { Markdown } from "./Markdown";

const ROTULO: Record<Situacao["tipo"], string> = {
  rodando: "Em execução",
  voce: "Precisa de você",
  erro: "Execução falhou",
  entregue: "Entregue",
};

function alvo(s: Situacao): { href: string; texto: string } | null {
  switch (s.acao) {
    case "responder":
    case "enviar_respostas":
      return { href: "#duvidas", texto: s.acao === "responder" ? "Responder dúvidas" : "Enviar respostas" };
    case "g1":
    case "g2":
    case "g3":
      return { href: "#decisao", texto: `Ir para a aprovação do ${s.acao.toUpperCase()}` };
    case "acionar":
      return { href: "#acionar", texto: s.agente ? `Acionar ${s.agente}` : "Acionar agente" };
    default:
      return null;
  }
}

/** Quadro no topo da feature: diz em uma frase se a squad está trabalhando ou esperando, e o que fazer. */
export function SituacaoCard({ s, rodando, ultima, podeAgir }: { s: Situacao; rodando: Run | null; ultima: Run | null; podeAgir: boolean }) {
  const a = podeAgir ? alvo(s) : null;
  const icone =
    s.tipo === "rodando" ? <span className="dot pulse" /> : s.tipo === "entregue" ? <IconCheck size={18} /> : s.tipo === "erro" ? <IconX size={18} /> : <IconGate size={18} />;
  return (
    <section className={`card sit sit-${s.tipo}`} aria-live="polite">
      <div className="sit-head">
        <div className="sit-icon">{icone}</div>
        <div className="sit-text">
          <div className="sit-kicker">{ROTULO[s.tipo]}</div>
          <h2>{s.titulo}</h2>
          <p>
            {s.detalhe}
            {!podeAgir && s.tipo === "voce" && " Quem decide é o operador da squad."}
          </p>
          {rodando && (
            <p className="xs sit-meta">
              <IconClock size={13} /> {rodando.status === "queued" ? "na fila" : "começou"} {ago(rodando.createdAt)} ·{" "}
              <a href={rodando.url} target="_blank" rel="noreferrer">
                acompanhar no GitHub ↗
              </a>
            </p>
          )}
        </div>
        {a && (
          <a href={a.href} className="btn btn-primary sit-cta">
            {a.texto}
          </a>
        )}
      </div>
      {ultima?.resumo && s.tipo !== "entregue" && (
        <div className="sit-msg">
          <div className="xs muted sit-msg-head">
            <b>Última mensagem do {ultima.agente}</b> · {ago(ultima.updatedAt)} ·{" "}
            <a href={ultima.url} target="_blank" rel="noreferrer">
              logs ↗
            </a>
          </div>
          <Markdown>{ultima.resumo}</Markdown>
        </div>
      )}
      {ultima && !ultima.resumo && s.tipo === "erro" && (
        <div className="sit-msg xs">
          A execução não deixou mensagem (falhou antes de terminar).{" "}
          <a href={ultima.url} target="_blank" rel="noreferrer">
            Ver logs ↗
          </a>
        </div>
      )}
    </section>
  );
}

/** Selo compacto para listas (visão geral). */
export function SituacaoBadge({ s }: { s: Situacao }) {
  const cls = { rodando: "badge-blue", voce: "badge-amber", erro: "badge-red", entregue: "badge-green" }[s.tipo];
  return (
    <span className={`badge ${cls}`} title={s.detalhe}>
      {(s.tipo === "rodando" || s.tipo === "voce") && <span className={`dot${s.tipo === "rodando" ? " pulse" : ""}`} />} {s.titulo}
    </span>
  );
}
