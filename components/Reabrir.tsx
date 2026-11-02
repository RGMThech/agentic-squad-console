"use client";

import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { reabrirFeature } from "@/lib/actions";

/** Reabre uma feature entregue para ajustes, tarefas pendentes ou mudança de especificação. */
export function ReabrirFeature({ hidden }: { hidden: React.ReactNode }) {
  const [tipo, setTipo] = useState<"ajustes" | "spec">("ajustes");
  return (
    <ActionForm action={reabrirFeature} submit={tipo === "spec" ? "Reabrir e editar a spec" : "Reabrir a feature"} pending="Reabrindo…" variant="primary" block>
      {hidden}
      <input type="hidden" name="tipo" value={tipo} />
      <div className="seg" role="radiogroup" aria-label="Motivo da reabertura">
        <button type="button" role="radio" aria-checked={tipo === "ajustes"} className={`seg-item${tipo === "ajustes" ? " on" : ""}`} onClick={() => setTipo("ajustes")}>
          Ajustes ou tarefas pendentes
        </button>
        <button type="button" role="radio" aria-checked={tipo === "spec"} className={`seg-item${tipo === "spec" ? " on" : ""}`} onClick={() => setTipo("spec")}>
          Mudar a especificação
        </button>
      </div>
      <textarea
        name="motivo"
        className="textarea"
        required
        minLength={10}
        rows={4}
        placeholder={tipo === "spec" ? "O que muda na definição e por quê." : "O que corrigir, ajustar ou terminar. Ex.: a gold por município não traz votos nulos; reexecutar T-05."}
      />
      {tipo === "ajustes" && (
        <label className="check small">
          <input type="checkbox" name="acionar" defaultChecked /> Acionar o orquestrador em seguida
        </label>
      )}
    </ActionForm>
  );
}
