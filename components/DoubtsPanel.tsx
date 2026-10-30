"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { answerDoubts, type ActionState } from "@/lib/actions";
import type { Doubt } from "@/lib/core";

type Props = {
  owner: string;
  repo: string;
  feature: string;
  abertas: Doubt[];
  resolvidas: string[];
  podeResponder: boolean;
  analistaRodando: boolean;
  versao?: string;
};

function Botao({ intent, label, pendente, variant, disabled, title }: { intent: string; label: string; pendente: string; variant: string; disabled?: boolean; title?: string }) {
  const { pending, data } = useFormStatus();
  const meu = pending && data?.get("intent") === intent;
  return (
    <button type="submit" name="intent" value={intent} className={`btn ${variant}`} disabled={pending || disabled} aria-busy={meu} title={title}>
      {meu ? pendente : label}
    </button>
  );
}

export function DoubtsPanel({ owner, repo, feature, abertas, resolvidas, podeResponder, analistaRodando, versao }: Props) {
  const [state, action] = useActionState(answerDoubts, {} as ActionState);
  const [textos, setTextos] = useState<string[]>(() => abertas.map((d) => d.resposta ?? ""));
  // nova rodada do analista: recarrega os campos
  const chave = abertas.map((d) => d.texto + "|" + (d.resposta ?? "")).join("§");
  useEffect(() => setTextos(abertas.map((d) => d.resposta ?? "")), [chave]); // eslint-disable-line react-hooks/exhaustive-deps

  const salvas = abertas.filter((d) => d.resposta).length;
  const preenchidas = textos.filter((t) => t.trim()).length;
  const naoSalvas = abertas.filter((d, i) => (d.resposta ?? "").trim() !== (textos[i] ?? "").trim()).length;
  const bloqueado = !podeResponder || analistaRodando;

  return (
    <section className="card doubts">
      <div className="card-head">
        <div>
          <h2>Dúvidas do analista</h2>
          <p className="small muted" style={{ marginTop: 2 }}>
            {abertas.length} aberta(s) · {preenchidas} respondida(s){versao ? ` · spec v${versao}` : ""}
          </p>
        </div>
        <span className="badge badge-amber">G1 bloqueado até zerar</span>
      </div>

      {analistaRodando && (
        <div className="card-pad" style={{ paddingBottom: 0 }}>
          <div className="alert alert-info">O analista está reprocessando a spec com as suas respostas. A página atualiza sozinha.</div>
        </div>
      )}

      <form action={action}>
        <input type="hidden" name="owner" value={owner} />
        <input type="hidden" name="repo" value={repo} />
        <input type="hidden" name="feature" value={feature} />
        <input type="hidden" name="n" value={abertas.length} />

        <ol className="doubt-list">
          {abertas.map((d, i) => {
            const salvo = (d.resposta ?? "").trim();
            const atual = (textos[i] ?? "").trim();
            const estado = !atual ? "pendente" : salvo === atual ? "salva" : "editando";
            return (
              <li key={d.texto} className={`doubt doubt-${estado}`}>
                <div className="doubt-q">
                  <span className="doubt-n">{i + 1}</span>
                  <p>{d.texto}</p>
                  <span className={`badge ${estado === "salva" ? "badge-green" : estado === "editando" ? "badge-amber" : ""}`}>
                    {estado === "salva" ? "Resposta salva" : estado === "editando" ? "Não salva" : "Sem resposta"}
                  </span>
                </div>
                <input type="hidden" name={`q_${i}`} value={d.texto} />
                <textarea
                  name={`r_${i}`}
                  className="textarea"
                  aria-label={`Resposta à dúvida ${i + 1}`}
                  placeholder={podeResponder ? "Sua resposta…" : "Somente operadores respondem às dúvidas."}
                  value={textos[i] ?? ""}
                  onChange={(e) => setTextos((t) => t.map((x, j) => (j === i ? e.target.value : x)))}
                  disabled={bloqueado}
                  rows={2}
                />
                {d.autor && salvo && <span className="xs muted">Respondida por {d.autor}</span>}
                {podeResponder && (
                  <div className="doubt-actions">
                    <Botao intent="salvar" label="Salvar resposta" pendente="Salvando…" variant="btn-sm" disabled={bloqueado || estado !== "editando"} />
                  </div>
                )}
              </li>
            );
          })}
        </ol>

        {podeResponder && (
          <div className="doubt-footer">
            <div className="small">
              <b>{preenchidas} de {abertas.length}</b> respondida(s)
              {naoSalvas > 0 && <span className="muted"> · {naoSalvas} alteração(ões) não salva(s), entram no envio</span>}
              <p className="xs muted" style={{ marginTop: 4 }}>
                Não precisa responder todas: o analista reavalia as que ficaram em aberto, fecha as que suas respostas já esclarecem e pode abrir novas.
              </p>
            </div>
            <Botao
              intent="enviar"
              label="Enviar respostas ao analista"
              pendente="Enviando…"
              variant="btn-gate"
              disabled={bloqueado || preenchidas === 0}
              title={preenchidas === 0 ? "Responda pelo menos uma dúvida" : undefined}
            />
          </div>
        )}
        {(state.error || state.message) && (
          <div className="card-pad" style={{ paddingTop: 0 }}>
            {state.error && <div className="alert alert-error" role="alert">{state.error}</div>}
            {state.ok && state.message && <div className="alert alert-ok" role="status">{state.message}</div>}
          </div>
        )}
      </form>

      {resolvidas.length > 0 && (
        <details className="doubt-resolved">
          <summary className="small">{resolvidas.length} dúvida(s) já resolvida(s)</summary>
          <ul className="small muted">
            {resolvidas.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
