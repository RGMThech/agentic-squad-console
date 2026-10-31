import { ActionForm } from "@/components/ActionForm";
import { IconExternal, IconGithub } from "@/components/Icons";
import { PageHead } from "@/components/Shell";
import { diagnosticar, type Diagnostico } from "@/lib/conexoes";
import { atualizarConexao, conectarAppConsole, conectarAppProprio } from "@/lib/conexoes-actions";
import type { ConexaoRow } from "@/lib/db";
import { env } from "@/lib/env";
import { when } from "@/lib/format";
import { appDoConsoleConfigurado, errMsg, instalacoesDoConsole, linkInstalacao, listarConexoes, REQUIRED_PERMISSIONS } from "@/lib/github";
import { requireAdmin } from "@/lib/session";

export const metadata = { title: "Conexões" };
export const dynamic = "force-dynamic";

const web = env.githubApiUrl ? env.githubApiUrl.replace(/\/api\/v3$/, "") : "https://github.com";

function Status({ d }: { d: Diagnostico }) {
  if (d.erro) return <span className="badge badge-red">com erro</span>;
  return d.ok ? <span className="badge badge-green">funcionando</span> : <span className="badge badge-amber">precisa de ajuste</span>;
}

function CartaoConexao({ c, d }: { c: ConexaoRow; d: Diagnostico }) {
  const hidden = <input type="hidden" name="owner" value={c.owner} />;
  return (
    <section className={`card conexao ${c.ativo ? "" : "pausada"}`}>
      <div className="card-head">
        <div className="row">
          <IconGithub size={18} />
          <h2>{c.owner}</h2>
          {c.ativo ? <Status d={d} /> : <span className="badge">pausada</span>}
          <span className="badge">{c.modo === "app_proprio" ? `App próprio (${c.appId})` : "App do Squad Console"}</span>
        </div>
        <a href={`${web}/organizations/${c.owner}/settings/installations`} target="_blank" rel="noreferrer" className="small row" style={{ gap: 4 }}>
          Instalação no GitHub <IconExternal size={13} />
        </a>
      </div>
      <div className="card-pad stack-sm">
        {d.erro ? (
          <div className="alert alert-error small">{d.erro}</div>
        ) : (
          <ul className="checagens small">
            <li className={d.faltando.length ? "bad" : "ok"}>{d.faltando.length ? `Permissões faltando: ${d.faltando.join(", ")}` : "Permissões completas"}</li>
            <li className={d.selecao === "all" ? "ok" : "bad"}>{d.selecao === "all" ? "Acesso a todos os repositórios" : 'Instalado só em repositórios selecionados: escolha "All repositories"'}</li>
            <li className={d.template.ok ? "ok" : "bad"}>{d.template.detalhe}</li>
            <li className="ok">Bot nos workflows: {d.bot}</li>
          </ul>
        )}
        <div className="xs muted">
          Conectada por {c.criadoPor} em {when(c.criadoEm.toISOString())}
        </div>
        <div className="conexao-acoes">
          <ActionForm action={atualizarConexao} submit="Salvar template" variant="default" className="form form-inline">
            {hidden}
            <input type="hidden" name="intent" value="template" />
            <input name="template" className="input mono" defaultValue={c.template} aria-label={`Template das squads de ${c.owner}`} />
          </ActionForm>
          <div className="row" style={{ gap: 8 }}>
            <ActionForm action={atualizarConexao} submit={c.ativo ? "Pausar" : "Ativar"} variant="default" className="form">
              {hidden}
              <input type="hidden" name="intent" value={c.ativo ? "pausar" : "ativar"} />
            </ActionForm>
            <ActionForm
              action={atualizarConexao}
              submit="Desconectar"
              variant="danger"
              className="form"
              confirm={`Desconectar ${c.owner}? Os repositórios continuam no GitHub; as squads só somem do console.`}
            >
              {hidden}
              <input type="hidden" name="intent" value="desconectar" />
            </ActionForm>
          </div>
        </div>
      </div>
    </section>
  );
}

export default async function ConexoesPage() {
  await requireAdmin();
  let erro = "";
  let conexoes: ConexaoRow[] = [];
  try {
    conexoes = await listarConexoes();
  } catch (e) {
    erro = errMsg(e);
  }
  const [diags, link, instalacoes] = await Promise.all([
    Promise.all(conexoes.map((c) => (c.ativo ? diagnosticar(c) : Promise.resolve({ ok: true, faltando: [], template: { ok: true, detalhe: "" } } as Diagnostico)))),
    linkInstalacao().catch(() => null),
    instalacoesDoConsole().catch(() => []),
  ]);
  const conectadas = new Set(conexoes.map((c) => c.owner.toLowerCase()));
  const pendentes = instalacoes.filter((i) => !conectadas.has(i.login.toLowerCase()) && i.tipo !== "User");

  return (
    <>
      <PageHead
        title="Conexões com o GitHub"
        subtitle="Organizações do GitHub onde o console cria e opera squads. Cada squad é um repositório na organização dela; os agentes rodam no GitHub Actions de lá."
      />
      <div className="content stack">
        {erro && <div className="alert alert-error">{erro}</div>}

        {conexoes.length === 0 && !erro && (
          <div className="alert alert-info">Nenhuma organização conectada ainda. Conecte a primeira abaixo.</div>
        )}
        {conexoes.map((c, i) => (
          <CartaoConexao key={c.owner} c={c} d={diags[i]} />
        ))}

        {pendentes.length > 0 && (
          <section className="card">
            <div className="card-head">
              <h2>App instalado, ainda não conectado</h2>
            </div>
            <div className="card-pad stack-sm">
              {pendentes.map((p) => (
                <ActionForm key={p.id} action={conectarAppConsole} submit={`Conectar ${p.login}`} className="form form-inline">
                  <input type="hidden" name="owner" value={p.login} />
                  <input type="hidden" name="template" value={env.templateRepo} />
                  <span className="small">
                    <b>{p.login}</b> instalou o App do Squad Console{p.faltando.length ? ` (faltam permissões: ${p.faltando.join(", ")})` : ""}.
                  </span>
                </ActionForm>
              ))}
            </div>
          </section>
        )}

        <section className="card">
          <div className="card-head">
            <h2>Conectar outra organização</h2>
          </div>
          <div className="card-pad stack">
            <div className="grid grid-2 conectar">
              <div className="stack-sm">
                <h3>Com o App do Squad Console</h3>
                <p className="small muted">O jeito mais rápido. Um administrador da organização instala o App e escolhe <b>All repositories</b>; depois você conecta aqui.</p>
                {appDoConsoleConfigurado() && link ? (
                  <a href={link.url} target="_blank" rel="noreferrer" className="btn" style={{ alignSelf: "flex-start" }}>
                    1. Instalar o App em outra organização <IconExternal size={13} />
                  </a>
                ) : (
                  <p className="small muted">O App do console não está configurado neste servidor.</p>
                )}
                <p className="xs muted">
                  Se a organização não aparecer na lista de instalação, o App está restrito à sua conta. No GitHub: Developer settings → GitHub Apps → o App → Advanced → <b>Make public</b>.
                </p>
                <ActionForm action={conectarAppConsole} submit="2. Conectar" pending="Conferindo a instalação…" resetOnOk>
                  <div className="field">
                    <label htmlFor="c-owner">Organização</label>
                    <input id="c-owner" name="owner" className="input" required placeholder="empresa-cliente" />
                  </div>
                  <div className="field">
                    <label htmlFor="c-template">Template das squads</label>
                    <input id="c-template" name="template" className="input mono" defaultValue={env.templateRepo} />
                    <span className="hint">Repositório público ou da própria organização, marcado como Template repository.</span>
                  </div>
                </ActionForm>
              </div>

              <div className="stack-sm">
                <h3>Com um GitHub App próprio da organização</h3>
                <p className="small muted">
                  Para quem não pode instalar Apps de terceiros. A organização cria um GitHub App dela, com as permissões abaixo, instala em <b>All repositories</b> e passa o
                  App ID e a chave privada. A chave fica cifrada no banco do console.
                </p>
                <details className="small">
                  <summary style={{ cursor: "pointer" }}>Permissões do App (Repository)</summary>
                  <ul className="xs" style={{ margin: "6px 0 0 16px" }}>
                    {Object.entries(REQUIRED_PERMISSIONS).map(([k, v]) => (
                      <li key={k}>
                        {k.replace("_", " ")}: {v === "write" ? "Read and write" : "Read-only"}
                      </li>
                    ))}
                  </ul>
                </details>
                <ActionForm action={conectarAppProprio} submit="Conectar com App próprio" pending="Autenticando o App…" resetOnOk>
                  <div className="grid grid-2">
                    <div className="field">
                      <label htmlFor="p-owner">Organização</label>
                      <input id="p-owner" name="owner" className="input" required placeholder="empresa-cliente" />
                    </div>
                    <div className="field">
                      <label htmlFor="p-app">App ID</label>
                      <input id="p-app" name="appId" className="input mono" required inputMode="numeric" placeholder="1234567" />
                    </div>
                  </div>
                  <div className="field">
                    <label htmlFor="p-chave">Chave privada (.pem)</label>
                    <textarea id="p-chave" name="chave" className="textarea mono xs" rows={5} required autoComplete="off" spellCheck={false} placeholder={"-----BEGIN RSA PRIVATE KEY-----\n…\n-----END RSA PRIVATE KEY-----"} />
                  </div>
                  <div className="field">
                    <label htmlFor="p-template">Template das squads</label>
                    <input id="p-template" name="template" className="input mono" defaultValue={env.templateRepo} />
                  </div>
                </ActionForm>
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
