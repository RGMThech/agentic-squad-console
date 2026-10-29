import Link from "next/link";

export default function NotFound() {
  return (
    <div style={{ minHeight: "70vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div className="card card-pad stack-sm" style={{ maxWidth: 440, textAlign: "center" }}>
        <h1>Não encontrado</h1>
        <p className="muted">A página não existe ou você não tem acesso a esta squad no GitHub.</p>
        <div>
          <Link href="/squads" className="btn btn-primary">
            Voltar para as squads
          </Link>
        </div>
      </div>
    </div>
  );
}
