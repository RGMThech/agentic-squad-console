"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { cancelLogin, requestCode, verifyCode, type LoginState } from "@/lib/auth-actions";

function Submit({ label, pending, variant = "primary" }: { label: string; pending: string; variant?: string }) {
  const { pending: p } = useFormStatus();
  return (
    <button type="submit" className={`btn btn-${variant} btn-block`} disabled={p} aria-busy={p} style={{ height: 44 }}>
      {p ? pending : label}
    </button>
  );
}

export function EmailForm({ next }: { next: string }) {
  const [state, action] = useActionState(requestCode, {} as LoginState);
  return (
    <form action={action} className="form">
      <input type="hidden" name="next" value={next} />
      <div className="field">
        <label htmlFor="email">E-mail</label>
        <input id="email" name="email" type="email" className="input" required autoComplete="email" autoFocus placeholder="voce@empresa.com.br" style={{ height: 44 }} />
      </div>
      {state.error && <div className="alert alert-error" role="alert">{state.error}</div>}
      <Submit label="Receber código" pending="Enviando…" />
    </form>
  );
}

export function CodeForm({ email }: { email: string }) {
  const [state, action] = useActionState(verifyCode, {} as LoginState);
  const [resendState, resend] = useActionState(requestCode, {} as LoginState);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (state.error) ref.current?.select();
  }, [state]);

  return (
    <div className="stack-sm" style={{ gap: 16 }}>
      <form action={action} className="form">
        <div className="field">
          <label htmlFor="code">Código de 6 dígitos</label>
          <input
            ref={ref}
            id="code"
            name="code"
            className="input code-input"
            required
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]{6,7}"
            maxLength={7}
            autoFocus
            placeholder="000000"
            aria-describedby="code-hint"
          />
          <span id="code-hint" className="hint">
            Código para <b>{email}</b>. Vale por 10 minutos e só pode ser usado uma vez.
          </span>
        </div>
        {state.error && <div className="alert alert-error" role="alert">{state.error}</div>}
        <Submit label="Entrar" pending="Conferindo…" />
      </form>
      <div className="spread small">
        <form action={resend}>
          <input type="hidden" name="reenviar" value="1" />
          <button className="link-btn" type="submit">Reenviar código</button>
        </form>
        <form action={cancelLogin}>
          <button className="link-btn" type="submit">Usar outro e-mail</button>
        </form>
      </div>
      {resendState.message && <div className="alert alert-info" role="status">{resendState.message}</div>}
      {resendState.error && <div className="alert alert-error" role="alert">{resendState.error}</div>}
    </div>
  );
}
