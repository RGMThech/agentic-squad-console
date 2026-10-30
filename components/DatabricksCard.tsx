"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { saveDatabricks, type DbxState } from "@/lib/actions";
import { IconCheck, IconX } from "./Icons";

type Props = {
  owner: string;
  repo: string;
  atual: { host: string; warehouseId: string; leitura: string[]; escrita: string } | null;
  segredo: { set: boolean; updatedAt: string | null };
  podeEditar: boolean;
};

function Botao({ intent, label, pendente, variant }: { intent: string; label: string; pendente: string; variant: string }) {
  const { pending, data } = useFormStatus();
  const meu = pending && data?.get("intent") === intent;
  return (
    <button type="submit" name="intent" value={intent} className={`btn ${variant}`} disabled={pending} aria-busy={meu}>
      {meu ? pendente : label}
    </button>
  );
}

export function DatabricksCard({ owner, repo, atual, segredo, podeEditar }: Props) {
  const [state, action] = useActionState(saveDatabricks, {} as DbxState);
  // campos controlados: o React limpa formulários após cada envio, e um teste
  // que falha não deve obrigar a redigitar tudo
  const [v, setV] = useState({
    host: atual?.host ?? "",
    warehouse: atual?.warehouseId ?? "",
    leitura: atual?.leitura.join(", ") ?? "",
    escrita: atual?.escrita ?? "",
    clientId: "",
    secret: "",
  });
  const campo = (k: keyof typeof v) => ({ value: v[k], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setV((x) => ({ ...x, [k]: e.target.value })) });
  useEffect(() => {
    if (state.salvo) setV((x) => ({ ...x, clientId: "", secret: "" }));
  }, [state]);
  const configurado = Boolean(atual?.host && atual?.warehouseId && segredo.set);

  return (
    <section className="card">
      <div className="card-head">
        <div className="row">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="m12 3 9 5-9 5-9-5z" /><path d="m3 13 9 5 9-5" /><path d="m3 17.5 9 5 9-5" />
          </svg>
          <h2>Databricks</h2>
          {configurado ? <span className="badge badge-green">Conectado</span> : <span className="badge">Não configurado</span>}
        </div>
        <a href={`https://github.com/${owner}/${repo}/blob/main/docs/databricks.md`} target="_blank" rel="noreferrer" className="small">
          Guia passo a passo ↗
        </a>
      </div>

      <div className="card-pad stack">
        <p className="small muted">
          Os agentes acessam o Databricks com um <b>service principal</b> da squad: leitura só nos catálogos liberados e escrita só na sandbox.
          As credenciais vão criptografadas para os segredos do GitHub Actions; o console não as guarda.
        </p>

        {atual && (
          <div className="dbx-resumo small">
            <div><span className="muted">Host</span><span className="mono xs">{atual.host || "—"}</span></div>
            <div><span className="muted">Warehouse</span><span className="mono xs">{atual.warehouseId || "—"}</span></div>
            <div><span className="muted">Leitura</span><span>{atual.leitura.length ? atual.leitura.join(", ") : "—"}</span></div>
            <div><span className="muted">Sandbox</span><span>{atual.escrita || "—"}</span></div>
            <div><span className="muted">Credenciais</span><span>{segredo.set ? "salvas no GitHub" : "ausentes"}</span></div>
          </div>
        )}

        {podeEditar ? (
          <form action={action} className="form">
            <input type="hidden" name="owner" value={owner} />
            <input type="hidden" name="repo" value={repo} />
            <div className="grid grid-2">
              <div className="field">
                <label htmlFor="dbx-host">Host do workspace</label>
                <input id="dbx-host" name="host" {...campo("host")} className="input mono" required placeholder="https://adb-1234567890123456.7.azuredatabricks.net" />
              </div>
              <div className="field">
                <label htmlFor="dbx-wh">Warehouse ID</label>
                <input id="dbx-wh" name="warehouse" {...campo("warehouse")} className="input mono" required placeholder="a1b2c3d4e5f67890" />
                <span className="hint">Só o ID (está na URL do warehouse), com permissão “Can use” para o service principal.</span>
              </div>
            </div>
            <div className="grid grid-2">
              <div className="field">
                <label htmlFor="dbx-leitura">Leitura (catálogos ou catalogo.schema)</label>
                <input id="dbx-leitura" name="leitura" {...campo("leitura")} className="input" placeholder="vendas.silver, crm" />
              </div>
              <div className="field">
                <label htmlFor="dbx-escrita">Escrita — sandbox (catalogo.schema)</label>
                <input id="dbx-escrita" name="escrita" {...campo("escrita")} className="input" placeholder="squad_dev.agentes" />
              </div>
            </div>
            <div className="grid grid-2">
              <div className="field">
                <label htmlFor="dbx-id">Client ID (Application ID)</label>
                <input id="dbx-id" name="clientId" {...campo("clientId")} className="input mono" autoComplete="off" placeholder={segredo.set ? "manter o atual" : "00000000-0000-0000-0000-000000000000"} />
              </div>
              <div className="field">
                <label htmlFor="dbx-secret">Client secret</label>
                <input id="dbx-secret" name="secret" {...campo("secret")} type="password" className="input mono" autoComplete="off" placeholder={segredo.set ? "manter o atual" : "secret do service principal"} />
                <span className="hint">{segredo.set ? "Deixe em branco para manter as credenciais salvas." : "Gerado na aba Secrets do service principal."}</span>
              </div>
            </div>

            {state.checks && state.checks.length > 0 && (
              <ul className="dbx-checks">
                {state.checks.map((c) => (
                  <li key={c.titulo} className={c.ok ? "ok" : "bad"}>
                    <span className={`tl-icon ${c.ok ? "ok" : "bad"}`}>{c.ok ? <IconCheck size={13} /> : <IconX size={13} />}</span>
                    <div>
                      <b>{c.titulo}</b>
                      <div className="xs muted">{c.detalhe}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {state.error && <div className="alert alert-error" role="alert">{state.error}</div>}
            {state.ok && state.message && (
              <div className="alert alert-ok" role="status">
                {state.message} {state.url && <a href={state.url} target="_blank" rel="noreferrer">Abrir PR ↗</a>}
              </div>
            )}

            <div className="row">
              <Botao intent="testar" label="Testar conexão" pendente="Testando…" variant="" />
              <Botao intent="salvar" label="Testar e salvar" pendente="Salvando…" variant="btn-primary" />
            </div>
          </form>
        ) : (
          !atual && <p className="small muted">Somente operadores configuram o acesso.</p>
        )}
      </div>
    </section>
  );
}
