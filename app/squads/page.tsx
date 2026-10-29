import Link from "next/link";
import { IconLayers, IconPlus } from "@/components/Icons";
import { PageHead } from "@/components/Shell";
import { env } from "@/lib/env";
import { ago } from "@/lib/format";
import { errMsg } from "@/lib/github";
import { requireUser } from "@/lib/session";
import { listSquads, type SquadSummary } from "@/lib/squad";

export const metadata = { title: "Squads" };

export default async function SquadsPage() {
  const user = await requireUser();
  let squads: SquadSummary[] = [];
  let erro = "";
  try {
    squads = await listSquads(user);
  } catch (e) {
    erro = errMsg(e);
  }

  return (
    <>
      <PageHead
        title={user.isAdmin ? "Squads" : "Suas squads"}
        subtitle={
          user.isAdmin
            ? `Todas as squads da organização ${env.githubOrg}.`
            : "Squads em que você faz parte da equipe."
        }
        actions={
          user.isAdmin && (
            <Link href="/squads/new" className="btn btn-primary">
              <IconPlus size={16} /> Nova squad
            </Link>
          )
        }
      />
      <div className="content">
        {erro && <div className="alert alert-error">{erro}</div>}
        {!erro && squads.length === 0 && (
          <div className="card empty">
            <div className="ic">
              <IconLayers size={26} />
            </div>
            <h2>Nenhuma squad por aqui</h2>
            <p className="muted" style={{ margin: "8px auto 20px", maxWidth: 480 }}>
              {user.isAdmin
                ? "Crie a primeira squad a partir do template."
                : "Você ainda não faz parte da equipe de nenhuma squad. Peça a um operador para incluir seu e-mail."}
            </p>
            {user.isAdmin && (
              <Link href="/squads/new" className="btn btn-primary">
                Criar a primeira squad
              </Link>
            )}
          </div>
        )}
        <div className="grid grid-3">
          {squads.map((s) => (
            <Link key={`${s.owner}/${s.repo}`} href={`/s/${s.owner}/${s.repo}`} className="card squad-card">
              <div className="spread">
                <span className="badge badge-blue">{s.owner}</span>
                <span className="badge">{s.private ? "Privado" : "Público"}</span>
              </div>
              <h3>{s.repo}</h3>
              <p className="muted small" style={{ minHeight: 40 }}>
                {s.description || "Squad agêntica de Data Analytics"}
              </p>
              <p className="xs muted">Atualizado {ago(s.updatedAt)}</p>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
