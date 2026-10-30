"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { editSpec, type ActionState } from "@/lib/actions";
import { Markdown } from "./Markdown";

function Salvar() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending} aria-busy={pending}>
      {pending ? "Salvando…" : "Salvar nova versão da spec"}
    </button>
  );
}

/** Editor da spec: campos controlados, para nada se perder se o envio falhar. */
export function SpecEditor({ owner, repo, feature, inicial, aprovada, voltar }: { owner: string; repo: string; feature: string; inicial: string; aprovada: boolean; voltar: string }) {
  const [state, action] = useActionState(editSpec, {} as ActionState);
  const [texto, setTexto] = useState(inicial);
  const [motivo, setMotivo] = useState("");
  const [conferir, setConferir] = useState(true);
  const [ver, setVer] = useState(false);
  const corpo = texto.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
  const mudou = texto.trim() !== inicial.trim();

  return (
    <form action={action} className="stack">
      <input type="hidden" name="owner" value={owner} />
      <input type="hidden" name="repo" value={repo} />
      <input type="hidden" name="feature" value={feature} />
      <input type="hidden" name="conteudo" value={texto} />
      <input type="hidden" name="conferir" value={conferir ? "on" : ""} />

      {aprovada && (
        <div className="alert alert-warn small">
          Esta spec está <b>aprovada (G1)</b>. Ao salvar, ela volta para revisão e você aprova de novo. Se o design já foi aprovado, o G2 também reabre para o arquiteto
          ajustar o que mudou.
        </div>
      )}

      <div className="card">
        <nav className="tabs" aria-label="Modo">
          <button type="button" className={!ver ? "on" : ""} aria-current={!ver ? "page" : undefined} onClick={() => setVer(false)}>
            Editar
          </button>
          <button type="button" className={ver ? "on" : ""} aria-current={ver ? "page" : undefined} onClick={() => setVer(true)}>
            Visualizar
          </button>
        </nav>
        <div className="card-pad">
          {ver ? (
            <Markdown>{corpo}</Markdown>
          ) : (
            <textarea className="textarea spec-editor" value={texto} onChange={(e) => setTexto(e.target.value)} spellCheck={false} aria-label="Conteúdo da spec (markdown)" />
          )}
        </div>
      </div>

      <div className="card card-pad stack-sm">
        <div className="field">
          <label htmlFor="motivo">O que mudou e por quê</label>
          <input id="motivo" name="motivo" className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} required placeholder="Ex.: incluímos votos nulos e brancos; o relatório passa a ser por município." />
          <span className="hint">Fica registrado no histórico de alterações da spec e no PR.</span>
        </div>
        <label className="check">
          <input type="checkbox" checked={conferir} onChange={(e) => setConferir(e.target.checked)} />
          <span>
            <b>Pedir ao analista para conferir</b>
            <span className="small muted"> — ele revisa a consistência da spec com a sua alteração e aponta impactos, sem desfazer o que você escreveu.</span>
          </span>
        </label>
        {state.error && (
          <div className="alert alert-error" role="alert">
            {state.error}
          </div>
        )}
        <div className="row">
          <Salvar />
          <a href={voltar} className="btn">
            Cancelar
          </a>
          {!mudou && <span className="xs muted">Nenhuma alteração ainda.</span>}
        </div>
      </div>
    </form>
  );
}
