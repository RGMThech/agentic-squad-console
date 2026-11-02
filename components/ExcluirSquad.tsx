"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { excluirSquad, type ActionState } from "@/lib/actions";

function Botao({ habilitado, modo }: { habilitado: boolean; modo: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-danger" style={{ alignSelf: "flex-start" }} disabled={!habilitado || pending} aria-busy={pending}>
      {pending ? "Excluindo…" : modo === "console" ? "Tirar a squad do console" : "Excluir a squad e o repositório"}
    </button>
  );
}

/** Zona de perigo: exclui a squad (e o repositório no GitHub) depois de digitar o nome do repositório. */
export function ExcluirSquad({ owner, repo }: { owner: string; repo: string }) {
  const [state, action] = useActionState(excluirSquad, {} as ActionState);
  const [texto, setTexto] = useState("");
  const [modo, setModo] = useState("repositorio");

  return (
    <form action={action} className="stack-sm">
      <input type="hidden" name="owner" value={owner} />
      <input type="hidden" name="repo" value={repo} />
      <label className="check">
        <input type="radio" name="modo" value="repositorio" checked={modo === "repositorio"} onChange={() => setModo("repositorio")} />
        <span>
          <b>Excluir a squad e apagar o repositório no GitHub</b>
          <span className="small muted"> — some tudo: código, specs, entregas, PRs, issues, execuções e segredos. Não dá para desfazer.</span>
        </span>
      </label>
      <label className="check">
        <input type="radio" name="modo" value="console" checked={modo === "console"} onChange={() => setModo("console")} />
        <span>
          <b>Só tirar do console</b>
          <span className="small muted"> — o repositório continua no GitHub, sem o tópico da squad. Dá para voltar adicionando o tópico de novo.</span>
        </span>
      </label>
      <div className="field">
        <label htmlFor="confirmacao">
          Para confirmar, digite <span className="mono">{repo}</span>
        </label>
        <input id="confirmacao" name="confirmacao" className="input" autoComplete="off" spellCheck={false} value={texto} onChange={(e) => setTexto(e.target.value)} />
      </div>
      {state.error && <div className="alert alert-error small">{state.error}</div>}
      <Botao habilitado={texto === repo} modo={modo} />
    </form>
  );
}
