import Link from "next/link";
import { IconLayers, IconPlus } from "@/components/Icons";
import { PageHead } from "@/components/Shell";
import { env } from "@/lib/env";
import { ago } from "@/lib/format";
import { errMsg } from "@/lib/github";
import { reauthIf401 } from "@/lib/page";
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
    reauthIf401(e, "/squads");
    erro = errMsg(e);
  }

  return (
    <>
      <PageHead
        title="Suas squads"
        subtitle={`Repositórios do GitHub com o tópico "${env.topic}" aos quais você tem acesso.`}
        actions={
          <Link href="/squads/new" className="btn btn-primary">
            <IconPlus size={16} /> Nova squad
          </Link>
        }
      />
      <div className="content">
        {erro && <div className="alert alert-error">{erro}</div>}
        {!erro && squads.length === 0 && (
          <div className="card empty">
            <div className="ic">
              <IconLayers size={26} />
            </div>
            <h2>Nenhuma squad encontrada</h2>
            <p className="muted" style={{ margin: "8px auto 20px", maxWidth: 480 }}>
              Crie uma squad a partir do template, ou adicione o tópico <code>{env.topic}</code> a um repositório existente que siga o template.
            </p>
            <Link href="/squads/new" className="btn btn-primary">
              Criar a primeira squad
            </Link>
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
