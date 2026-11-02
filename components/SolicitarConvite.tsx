"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { solicitarConvite, type ConviteState } from "@/lib/convite-actions";
import { IconCheck } from "./Icons";

function Enviar() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending} aria-busy={pending} style={{ height: 46, padding: "0 26px", fontSize: 15 }}>
      {pending ? "Enviando…" : "Enviar pedido"}
    </button>
  );
}

/** Botão e formulário "Solicite seu convite" da landing page. */
export function SolicitarConvite() {
  const [state, action] = useActionState(solicitarConvite, {} as ConviteState);
  const [aberto, setAberto] = useState(false);
  const [inicio] = useState(() => Date.now());
  const [v, setV] = useState({ nome: "", email: "", empresa: "", cargo: "", mensagem: "" });
  const campo = (k: keyof typeof v) => ({ value: v[k], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV((x) => ({ ...x, [k]: e.target.value })) });

  if (state.ok)
    return (
      <div className="convite-ok" role="status">
        <span className="site-ic">
          <IconCheck size={20} />
        </span>
        <div>
          <h3>Pedido enviado</h3>
          <p className="muted small">Obrigado! Vamos analisar e responder no e-mail que você informou.</p>
        </div>
      </div>
    );

  if (!aberto)
    return (
      <button type="button" className="btn btn-primary" onClick={() => setAberto(true)} style={{ height: 50, padding: "0 30px", fontSize: 16 }}>
        Solicite seu convite
      </button>
    );

  return (
    <form action={action} className="form convite-form" aria-label="Solicitar convite">
      <input type="hidden" name="t" value={inicio} />
      <div className="convite-armadilha" aria-hidden="true">
        <label>
          Site <input name="site" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <div className="grid grid-2">
        <div className="field">
          <label htmlFor="cv-nome">Nome</label>
          <input id="cv-nome" name="nome" className="input" required autoComplete="name" {...campo("nome")} />
        </div>
        <div className="field">
          <label htmlFor="cv-email">E-mail de trabalho</label>
          <input id="cv-email" name="email" type="email" className="input" required autoComplete="email" {...campo("email")} />
        </div>
      </div>
      <div className="grid grid-2">
        <div className="field">
          <label htmlFor="cv-empresa">Empresa</label>
          <input id="cv-empresa" name="empresa" className="input" autoComplete="organization" {...campo("empresa")} />
        </div>
        <div className="field">
          <label htmlFor="cv-cargo">Cargo</label>
          <input id="cv-cargo" name="cargo" className="input" autoComplete="organization-title" {...campo("cargo")} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="cv-msg">O que você quer resolver com a squad? (opcional)</label>
        <textarea id="cv-msg" name="mensagem" className="textarea" rows={3} maxLength={1500} {...campo("mensagem")} />
      </div>
      {state.error && (
        <div className="alert alert-error" role="alert">
          {state.error}
        </div>
      )}
      <div className="row">
        <Enviar />
        <button type="button" className="btn" onClick={() => setAberto(false)}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
