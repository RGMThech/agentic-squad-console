"use client";

import { useState } from "react";
import Link from "next/link";
import { ActionForm } from "./ActionForm";
import { IconeTipo } from "./Icons";
import { createSquad } from "@/lib/actions";
import type { TipoCatalogo } from "@/lib/tipo";

export type OpcaoConexao = { owner: string; template: string; tipos: TipoCatalogo[]; aviso?: string };

/** Tipos que costumam usar a plataforma de dados (os outros podem configurar depois, em Acesso a dados). */
const USA_DADOS = new Set(["dados", "ia-ml", "produto", "atendimento", "software"]);

export function NovaSquadForm({ conexoes }: { conexoes: OpcaoConexao[] }) {
  const [owner, setOwner] = useState(conexoes[0].owner);
  const conexao = conexoes.find((c) => c.owner === owner) ?? conexoes[0];
  const [tipo, setTipo] = useState(conexao.tipos[0]?.id ?? "dados");
  const tipoValido = conexao.tipos.some((t) => t.id === tipo) ? tipo : conexao.tipos[0]?.id ?? "dados";

  return (
    <ActionForm action={createSquad} submit="Criar squad" pending="Criando repositório…">
      <div className="field">
        <label htmlFor="owner">Organização do GitHub</label>
        <select id="owner" name="owner" className="select" value={owner} onChange={(e) => setOwner(e.target.value)}>
          {conexoes.map((c) => (
            <option key={c.owner} value={c.owner}>
              {c.owner} — template {c.template}
            </option>
          ))}
        </select>
        <span className="hint">
          Falta alguma? <Link href="/admin/conexoes">Conecte outra organização</Link>.
        </span>
      </div>

      <fieldset className="field tipos-squad">
        <legend>Tipo de squad</legend>
        {conexao.aviso && <p className="xs muted">{conexao.aviso}</p>}
        <div className="tipos-grid" role="radiogroup">
          {conexao.tipos.map((t) => (
            <label key={t.id} className={`tipo-card${tipoValido === t.id ? " ativo" : ""}`}>
              <input type="radio" name="tipo" value={t.id} checked={tipoValido === t.id} onChange={() => setTipo(t.id)} />
              <span className="tipo-ic">
                <IconeTipo icone={t.icone} size={20} />
              </span>
              <span className="tipo-txt">
                <b>{t.nome}</b>
                <span className="xs muted">{t.descricao}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="field">
        <label htmlFor="nome">Nome do repositório</label>
        <div className="input-prefix">
          <span>repo /</span>
          <input id="nome" name="nome" className="input" required minLength={3} placeholder={`squad-${tipoValido}-cliente`} pattern="[A-Za-z0-9._-]+" />
        </div>
        <span className="hint">Letras minúsculas, números e hífen. Um prefixo como &quot;squad-&quot; ajuda a aplicar regras a todas as squads.</span>
      </div>
      <div className="grid grid-2">
        <div className="field">
          <label htmlFor="titulo">Nome de exibição</label>
          <input id="titulo" name="titulo" className="input" placeholder="Marketing Varejo" />
        </div>
        <div className="field">
          <label htmlFor="cliente">Cliente ou área</label>
          <input id="cliente" name="cliente" className="input" placeholder="Diretoria Comercial" />
        </div>
      </div>
      <div className="field">
        <label htmlFor="descricao">Descrição</label>
        <input id="descricao" name="descricao" className="input" placeholder="O que esta squad entrega" />
      </div>
      <div className="grid grid-2">
        <div className="field">
          <label htmlFor="plataforma">Plataforma de dados{tipoValido === "dados" ? "" : " (opcional)"}</label>
          <select id="plataforma" name="plataforma" className="select" defaultValue="agnostico">
            <option value="agnostico">{USA_DADOS.has(tipoValido) ? "Agnóstico" : "Nenhuma"}</option>
            <option value="databricks">Databricks</option>
            <option value="snowflake">Snowflake</option>
            <option value="bigquery">BigQuery</option>
            <option value="fabric">Microsoft Fabric</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="modelo">Modelo dos agentes</label>
          <select id="modelo" name="modelo" className="select" defaultValue="sonnet">
            <option value="sonnet">Sonnet (equilíbrio custo/qualidade)</option>
            <option value="opus">Opus (máxima qualidade)</option>
            <option value="haiku">Haiku (mais barato)</option>
          </select>
        </div>
      </div>
      {tipoValido === "dados" && (
        <label className="check">
          <input type="checkbox" name="dbt" />
          <span>
            <b>Usar dbt</b>
            <span className="small muted"> — os agentes modelam as transformações em dbt, sobre a plataforma escolhida.</span>
          </span>
        </label>
      )}
    </ActionForm>
  );
}
