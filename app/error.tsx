"use client";

import { useEffect, useState } from "react";

// Após um novo deploy, páginas abertas na versão anterior chamam server actions
// que não existem mais. Nesse caso basta recarregar para pegar a versão nova.
const VERSAO_ANTIGA = /Server Action .* was not found|Failed to find Server Action|failed-to-find-server-action/i;
const CHAVE = "squad-console-reload";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const desatualizada = VERSAO_ANTIGA.test(error.message || "");
  const [recarregando, setRecarregando] = useState(false);

  useEffect(() => {
    if (!desatualizada) return;
    let ultimo = 0;
    try {
      ultimo = Number(sessionStorage.getItem(CHAVE) || 0);
    } catch {
      /* armazenamento indisponível */
    }
    // evita laço de recarga: no máximo uma vez a cada 30 s
    if (Date.now() - ultimo > 30_000) {
      try {
        sessionStorage.setItem(CHAVE, String(Date.now()));
      } catch {
        /* ignora */
      }
      setRecarregando(true);
      window.location.reload();
    }
  }, [desatualizada]);

  if (desatualizada) {
    return (
      <div style={{ minHeight: "70vh", display: "grid", placeItems: "center", padding: 24 }}>
        <div className="card card-pad stack-sm" style={{ maxWidth: 520 }}>
          <h1>O console foi atualizado</h1>
          <p className="muted small">
            Uma versão nova acabou de ser publicada enquanto esta página estava aberta.
            {recarregando ? " Recarregando…" : " Recarregue a página e repita a ação."}
          </p>
          <div className="row">
            <button className="btn btn-primary" onClick={() => window.location.reload()}>
              Recarregar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "70vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div className="card card-pad stack-sm" style={{ maxWidth: 520 }}>
        <h1>Algo deu errado</h1>
        <p className="muted small">{/omitted in production builds/i.test(error.message || "") ? "O servidor encontrou um erro ao montar esta página." : error.message || "Erro inesperado."}</p>
        {error.digest && <p className="xs muted mono">ref: {error.digest}</p>}
        <p className="xs muted">
          Administrador: abra <a href="/api/health?verificar=1" target="_blank" rel="noreferrer">/api/health?verificar=1</a> para ver qual configuração falhou (banco, e-mail ou GitHub).
        </p>
        <div className="row">
          <button className="btn btn-primary" onClick={reset}>Tentar de novo</button>
          <a className="btn" href="/squads">Squads</a>
        </div>
      </div>
    </div>
  );
}
