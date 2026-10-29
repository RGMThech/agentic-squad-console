import { ActionForm } from "@/components/ActionForm";
import { PageHead, initials } from "@/components/Shell";
import { inviteUser, resendInvite, updateUser } from "@/lib/admin-actions";
import { store } from "@/lib/db";
import { env } from "@/lib/env";
import { ago, when } from "@/lib/format";
import { requireAdmin } from "@/lib/session";

export const metadata = { title: "Usuários" };

export default async function UsuariosPage() {
  const me = await requireAdmin();
  const users = await (await store()).listUsers();
  const ativos = users.filter((u) => u.status === "ativo").length;

  return (
    <>
      <PageHead
        title="Usuários"
        subtitle={`${ativos} conta(s) ativa(s). Só quem foi convidado consegue entrar. O acesso a cada squad é definido na equipe da squad.`}
      />
      <div className="content stack">
        <section className="card card-pad stack-sm">
          <div className="spread">
            <h2>Convidar pessoa</h2>
            <span className="small muted">A pessoa recebe um e-mail e entra informando o próprio endereço, com um código de acesso.</span>
          </div>
          <ActionForm action={inviteUser} submit="Enviar convite" pending="Enviando…" resetOnOk className="form invite-form">
            <div className="field">
              <label htmlFor="inv-email">E-mail</label>
              <input id="inv-email" name="email" type="email" className="input" required placeholder="pessoa@empresa.com.br" />
            </div>
            <div className="field">
              <label htmlFor="inv-name">Nome</label>
              <input id="inv-name" name="name" className="input" placeholder="Nome e sobrenome" />
            </div>
            <div className="field">
              <label htmlFor="inv-role">Papel no console</label>
              <select id="inv-role" name="role" className="select" defaultValue="usuario">
                <option value="usuario">Usuário — vê só as squads da sua equipe</option>
                <option value="admin">Administrador — vê tudo e convida</option>
              </select>
            </div>
          </ActionForm>
        </section>

          <section className="card">
            <div className="card-head">
              <h2>Contas</h2>
              <span className="muted small">{users.length} no total</span>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Pessoa</th>
                    <th>Papel</th>
                    <th>Status</th>
                    <th>Último acesso</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const protegido = env.adminEmails.includes(u.email);
                    const sou = u.id === me.id;
                    const hidden = <input type="hidden" name="id" value={u.id} />;
                    return (
                      <tr key={u.id}>
                        <td>
                          <div className="row" style={{ gap: 10, flexWrap: "nowrap" }}>
                            <span className="avatar avatar-initials avatar-light">{initials(u.name || u.email)}</span>
                            <div style={{ minWidth: 0 }}>
                              <div className="feature-title">{u.name || "—"}{sou && <span className="xs muted"> (você)</span>}</div>
                              <div className="xs muted">{u.email}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          {protegido ? (
                            <span className="badge badge-navy" title="Definido em ADMIN_EMAILS">Administrador</span>
                          ) : (
                            <ActionForm action={updateUser} submit="Salvar" variant="default" className="row inline-form">
                              {hidden}
                              <input type="hidden" name="acao" value="papel" />
                              <select name="role" className="select select-sm" defaultValue={u.role} aria-label={`Papel de ${u.email}`}>
                                <option value="usuario">Usuário</option>
                                <option value="admin">Administrador</option>
                              </select>
                            </ActionForm>
                          )}
                        </td>
                        <td>
                          {u.status === "ativo" ? <span className="badge badge-green">Ativa</span> : <span className="badge badge-red">Desativada</span>}
                        </td>
                        <td className="small nowrap" title={u.lastLoginAt ? when(u.lastLoginAt.toISOString()) : undefined}>
                          {u.lastLoginAt ? ago(u.lastLoginAt.toISOString()) : <span className="muted">nunca entrou</span>}
                        </td>
                        <td>
                          <div className="row" style={{ gap: 6, flexWrap: "nowrap", justifyContent: "flex-end" }}>
                            {!u.lastLoginAt && u.status === "ativo" && (
                              <ActionForm action={resendInvite} submit="Reenviar convite" variant="default" className="row inline-form">
                                {hidden}
                              </ActionForm>
                            )}
                            {u.lastLoginAt && u.status === "ativo" && (
                              <ActionForm action={updateUser} submit="Encerrar sessões" variant="default" className="row inline-form">
                                {hidden}
                                <input type="hidden" name="acao" value="encerrar_sessoes" />
                              </ActionForm>
                            )}
                            {!sou && !protegido && (
                              <ActionForm
                                action={updateUser}
                                submit={u.status === "ativo" ? "Desativar" : "Reativar"}
                                variant={u.status === "ativo" ? "danger" : "default"}
                                className="row inline-form"
                                confirm={u.status === "ativo" ? `Desativar ${u.email}? A pessoa perde o acesso na hora.` : undefined}
                              >
                                {hidden}
                                <input type="hidden" name="acao" value={u.status === "ativo" ? "desativar" : "reativar"} />
                              </ActionForm>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
      </div>
    </>
  );
}
