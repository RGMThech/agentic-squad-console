"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { saveDados, type DadosState } from "@/lib/actions";
import { ehPlataforma, LISTA_PLATAFORMAS, PLATAFORMAS, type DadosConfig, type Plataforma } from "@/lib/dados-meta";
import { IconCheck, IconX } from "./Icons";

type Props = {
  owner: string;
  repo: string;
  atual: DadosConfig | null;
  plataformaSquad: string;
  dbtPedido: boolean;
  segredos: Record<string, boolean>;
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

const inicial = (atual: DadosConfig | null, plataformaSquad: string): Plataforma =>
  atual?.plataforma ?? (ehPlataforma(plataformaSquad) ? plataformaSquad : "databricks");

export function DadosCard({ owner, repo, atual, plataformaSquad, dbtPedido, segredos, podeEditar }: Props) {
  const [state, action] = useActionState(saveDados, {} as DadosState);
  const [plat, setPlat] = useState<Plataforma>(inicial(atual, plataformaSquad));
  const meta = PLATAFORMAS[plat];
  const mesma = atual?.plataforma === plat;

  // campos controlados: o React limpa formulários após cada envio, e um teste
  // que falha não deve obrigar a redigitar tudo
  const valoresDe = (p: Plataforma) => ({
    conexao: Object.fromEntries(PLATAFORMAS[p].campos.map((c) => [c.k, atual?.plataforma === p ? atual.conexao[c.k] ?? "" : ""])),
    leitura: atual?.plataforma === p ? atual.leitura.join(", ") : "",
    escrita: atual?.plataforma === p ? atual.escrita : "",
  });
  const [v, setV] = useState(valoresDe(plat));
  const [dbt, setDbt] = useState(atual?.dbt ?? dbtPedido);
  const [seg, setSeg] = useState<Record<string, string>>({});

  const dbtRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (state.salvo) setSeg({});
    // o React 19 reinicia o formulário após o envio; a caixa volta ao estado real
    if (dbtRef.current) dbtRef.current.checked = dbt;
  }, [state, dbt]);

  const trocar = (p: Plataforma) => {
    setPlat(p);
    setV(valoresDe(p));
    setSeg({});
  };

  const segredosSalvos = meta.segredos.every((s) => segredos[s.nome]);
  const configurado = Boolean(atual && meta.campos.every((c) => c.opcional || atual.conexao[c.k]) && mesma && segredosSalvos);
  const manter = mesma && segredosSalvos;

  return (
    <section className="card">
      <div className="card-head">
        <div className="row">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <ellipse cx="12" cy="5" rx="8" ry="3" />
            <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
            <path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
          </svg>
          <h2>Acesso a dados</h2>
          {atual && configurado ? (
            <span className="badge badge-green">{PLATAFORMAS[atual.plataforma].rotulo}{atual.dbt ? " + dbt" : ""}</span>
          ) : (
            <span className="badge">Não configurado</span>
          )}
        </div>
        <a href={`https://github.com/${owner}/${repo}/blob/main/${meta.guia}`} target="_blank" rel="noreferrer" className="small">
          Guia {meta.rotulo} ↗
        </a>
      </div>

      <div className="card-pad stack">
        <p className="small muted">
          Os agentes consultam e testam com dados reais usando uma identidade própria da squad: leitura só nas fontes liberadas e escrita só na sandbox.
          As credenciais vão criptografadas para os segredos do GitHub Actions; o console não as guarda.
        </p>

        {atual && (
          <div className="dbx-resumo small">
            <div><span className="muted">Plataforma</span><span>{PLATAFORMAS[atual.plataforma].rotulo}</span></div>
            <div>
              <span className="muted">Conexão</span>
              <span className="mono xs">{PLATAFORMAS[atual.plataforma].campos.map((c) => atual.conexao[c.k]).filter(Boolean).join(" · ") || "—"}</span>
            </div>
            <div><span className="muted">Leitura</span><span>{atual.leitura.length ? atual.leitura.join(", ") : "—"}</span></div>
            <div><span className="muted">Sandbox</span><span>{atual.escrita || "—"}</span></div>
            <div>
              <span className="muted">Credenciais</span>
              <span>{PLATAFORMAS[atual.plataforma].segredos.every((s) => segredos[s.nome]) ? "salvas no GitHub" : "ausentes"}{atual.dbt ? " · dbt ativo" : ""}</span>
            </div>
          </div>
        )}

        {podeEditar ? (
          <form action={action} className="form">
            <input type="hidden" name="owner" value={owner} />
            <input type="hidden" name="repo" value={repo} />
            <input type="hidden" name="plataforma" value={plat} />

            <div className="seg" role="radiogroup" aria-label="Plataforma de dados">
              {LISTA_PLATAFORMAS.map((p) => (
                <button key={p} type="button" role="radio" aria-checked={plat === p} className={`seg-item${plat === p ? " on" : ""}`} onClick={() => trocar(p)}>
                  {PLATAFORMAS[p].rotulo}
                </button>
              ))}
            </div>
            {atual && !mesma && (
              <div className="alert alert-warn small">
                Ao salvar, a squad passa a usar {meta.rotulo} no lugar de {PLATAFORMAS[atual.plataforma].rotulo}. Os segredos antigos ficam no GitHub até você apagá-los.
              </div>
            )}

            <div className="grid grid-2">
              {meta.campos.map((c) => (
                <div className="field" key={`${plat}-${c.k}`}>
                  <label htmlFor={`cx-${c.k}`}>
                    {c.label}
                    {c.opcional && <span className="muted"> (opcional)</span>}
                  </label>
                  <input
                    id={`cx-${c.k}`}
                    name={`cx_${c.k}`}
                    value={v.conexao[c.k] ?? ""}
                    onChange={(e) => setV((x) => ({ ...x, conexao: { ...x.conexao, [c.k]: e.target.value } }))}
                    className="input mono"
                    required={!c.opcional}
                    placeholder={c.placeholder}
                  />
                  {c.hint && <span className="hint">{c.hint}</span>}
                </div>
              ))}
            </div>

            <div className="grid grid-2">
              <div className="field">
                <label htmlFor="dados-leitura">{meta.leitura.label}</label>
                <input id="dados-leitura" name="leitura" value={v.leitura} onChange={(e) => setV((x) => ({ ...x, leitura: e.target.value }))} className="input" placeholder={meta.leitura.placeholder} />
              </div>
              <div className="field">
                <label htmlFor="dados-escrita">Escrita — sandbox (banco.schema)</label>
                <input id="dados-escrita" name="escrita" value={v.escrita} onChange={(e) => setV((x) => ({ ...x, escrita: e.target.value }))} className="input" placeholder={meta.escrita} />
              </div>
            </div>

            <div className={meta.segredos.some((s) => s.multilinha) ? "stack-sm" : "grid grid-2"}>
              {meta.segredos.map((s) => (
                <div className="field" key={s.nome}>
                  <label htmlFor={`sg-${s.nome}`}>{s.label}</label>
                  {s.multilinha ? (
                    <textarea
                      id={`sg-${s.nome}`}
                      name={`sg_${s.nome}`}
                      value={seg[s.nome] ?? ""}
                      onChange={(e) => setSeg((x) => ({ ...x, [s.nome]: e.target.value }))}
                      className="textarea mono xs"
                      rows={5}
                      autoComplete="off"
                      spellCheck={false}
                      placeholder={manter ? "manter a atual" : s.placeholder}
                    />
                  ) : (
                    <input
                      id={`sg-${s.nome}`}
                      name={`sg_${s.nome}`}
                      type={/SECRET/.test(s.nome) ? "password" : "text"}
                      value={seg[s.nome] ?? ""}
                      onChange={(e) => setSeg((x) => ({ ...x, [s.nome]: e.target.value }))}
                      className="input mono"
                      autoComplete="off"
                      placeholder={manter ? "manter o atual" : s.placeholder}
                    />
                  )}
                  <span className="hint">{manter ? "Deixe em branco para manter as credenciais salvas." : s.hint ?? `Vai para o segredo ${s.nome} do GitHub Actions.`}</span>
                </div>
              ))}
            </div>

            <label className="check">
              <input type="hidden" name="dbt" value={dbt ? "on" : ""} />
              <input ref={dbtRef} type="checkbox" checked={dbt} onChange={(e) => setDbt(e.target.checked)} aria-label="Usar dbt" />
              <span>
                <b>Usar dbt</b>
                <span className="small muted"> — o workflow instala o {meta.dbt} e gera o perfil <code>squad</code> com destino na sandbox.</span>
              </span>
            </label>

            {state.checks && state.checks.length > 0 && (
              <ul className="dbx-checks">
                {state.checks.map((c) => (
                  <li key={c.titulo} className={c.ok ? "ok" : "bad"}>
                    <span className={`tl-icon ${c.ok ? "ok" : "bad"}`}>{c.ok ? <IconCheck size={13} /> : <IconX size={13} />}</span>
                    <div>
                      <b>{c.titulo}</b>
                      <div className="xs muted">{c.detalhe.replace(/^…/, "")}</div>
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
