"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/actions";

type Props = {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  submit: string;
  pending?: string;
  variant?: "primary" | "gate" | "success" | "default" | "danger";
  block?: boolean;
  confirm?: string;
  resetOnOk?: boolean;
  className?: string;
};

function Submit({ label, pending, variant, block }: { label: string; pending?: string; variant: string; block?: boolean }) {
  const { pending: isPending } = useFormStatus();
  const cls = ["btn", variant !== "default" ? `btn-${variant}` : "", block ? "btn-block" : ""].join(" ");
  return (
    <button type="submit" className={cls} disabled={isPending} aria-busy={isPending}>
      {isPending ? pending ?? "Enviando…" : label}
    </button>
  );
}

export function ActionForm({ action, children, submit, pending, variant = "primary", block, confirm, resetOnOk, className }: Props) {
  const [state, formAction] = useActionState(action, {} as ActionState);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok && resetOnOk) ref.current?.reset();
  }, [state, resetOnOk]);

  return (
    <form
      ref={ref}
      action={formAction}
      className={className ?? "form"}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {children}
      {state.error && <div className="alert alert-error" role="alert">{state.error}</div>}
      {state.ok && state.message && (
        <div className="alert alert-ok" role="status">
          {state.message} {state.url && <a href={state.url} target="_blank" rel="noreferrer">Abrir PR ↗</a>}
        </div>
      )}
      <div>
        <Submit label={submit} pending={pending} variant={variant} block={block} />
      </div>
    </form>
  );
}
