"use client";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div style={{ minHeight: "70vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div className="card card-pad stack-sm" style={{ maxWidth: 520 }}>
        <h1>Algo deu errado</h1>
        <p className="muted small">{error.message || "Erro inesperado ao falar com o GitHub."}</p>
        {error.digest && <p className="xs muted mono">ref: {error.digest}</p>}
        <div className="row">
          <button className="btn btn-primary" onClick={reset}>Tentar de novo</button>
          <a className="btn" href="/squads">Squads</a>
        </div>
      </div>
    </div>
  );
}
