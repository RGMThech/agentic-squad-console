import { ActionForm } from "@/components/ActionForm";
import { PageHead } from "@/components/Shell";
import { updateMyName } from "@/lib/admin-actions";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Minha conta" };

export default async function MinhaConta() {
  const user = await requireUser();
  return (
    <>
      <PageHead title="Minha conta" subtitle={`${user.email} · ${user.isAdmin ? "Administrador" : "Usuário"}`} />
      <div className="content">
        <div className="card card-pad" style={{ maxWidth: 520 }}>
          <ActionForm action={updateMyName} submit="Salvar">
            <div className="field">
              <label htmlFor="name">Nome de exibição</label>
              <input id="name" name="name" className="input" defaultValue={user.name} required minLength={2} maxLength={120} />
              <span className="hint">Aparece nas aprovações de gates e nos comentários dos Pull Requests.</span>
            </div>
          </ActionForm>
        </div>
      </div>
    </>
  );
}
