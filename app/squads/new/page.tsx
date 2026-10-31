import { ActionForm } from "@/components/ActionForm";
import { PageHead } from "@/components/Shell";
import { createSquad } from "@/lib/actions";
import Link from "next/link";
import { env } from "@/lib/env";
import { listarConexoes } from "@/lib/github";
import { requireAdmin } from "@/lib/session";

export const metadata = { title: "Nova squad" };

export default async function NewSquadPage() {
  await requireAdmin();
  const conexoes = (await listarConexoes()).filter((c) => c.ativo);
  if (!conexoes.length)
    return (
      <>
        <PageHead title="Nova squad" crumbs={[{ href: "/squads", label: "Squads" }, { label: "Nova" }]} />
        <div className="content">
          <div className="card card-pad stack-sm">
            <h2>Conecte uma organização do GitHub primeiro</h2>
            <p className="muted">As squads ficam em repositórios de uma organização do GitHub. Conecte a sua ou a do cliente em Conexões.</p>
            <Link href="/admin/conexoes" className="btn btn-primary" style={{ alignSelf: "flex-start" }}>
              Abrir Conexões
            </Link>
          </div>
        </div>
      </>
    );

  return (
    <>
      <PageHead
        title="Nova squad"
        crumbs={[{ href: "/squads", label: "Squads" }, { label: "Nova" }]}
        subtitle="Cria um repositório privado na organização escolhida, a partir do template dela, com você como operador."
      />
      <div className="content">
        <div className="split">
          <div className="card card-pad">
            <ActionForm action={createSquad} submit="Criar squad" pending="Criando repositório…">
              <div className="field">
                <label htmlFor="owner">Organização do GitHub</label>
                <select id="owner" name="owner" className="select" defaultValue={conexoes[0].owner}>
                  {conexoes.map((c) => (
                    <option key={c.owner} value={c.owner}>
                      {c.owner} — template {c.template || env.templateRepo}
                    </option>
                  ))}
                </select>
                <span className="hint">
                  Falta alguma? <Link href="/admin/conexoes">Conecte outra organização</Link>.
                </span>
              </div>
              <div className="field">
                <label htmlFor="nome">Nome do repositório</label>
                <div className="input-prefix">
                  <span>repo /</span>
                  <input id="nome" name="nome" className="input" required minLength={3} placeholder="squad-vendas-varejo" pattern="[A-Za-z0-9._-]+" />
                </div>
                <span className="hint">Letras minúsculas, números e hífen. Um prefixo como "squad-" ajuda a aplicar regras a todas as squads.</span>
              </div>
              <div className="grid grid-2">
                <div className="field">
                  <label htmlFor="titulo">Nome de exibição</label>
                  <input id="titulo" name="titulo" className="input" placeholder="Vendas Varejo" />
                </div>
                <div className="field">
                  <label htmlFor="cliente">Cliente ou área</label>
                  <input id="cliente" name="cliente" className="input" placeholder="Diretoria Comercial" />
                </div>
              </div>
              <div className="field">
                <label htmlFor="descricao">Descrição</label>
                <input id="descricao" name="descricao" className="input" placeholder="Indicadores de vendas e receita por canal" />
              </div>
              <div className="grid grid-2">
                <div className="field">
                  <label htmlFor="plataforma">Plataforma de dados</label>
                  <select id="plataforma" name="plataforma" className="select" defaultValue="agnostico">
                    <option value="agnostico">Agnóstico</option>
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
              <label className="check">
                <input type="checkbox" name="dbt" />
                <span>
                  <b>Usar dbt</b>
                  <span className="small muted"> — os agentes modelam as transformações em dbt, sobre a plataforma escolhida.</span>
                </span>
              </label>
            </ActionForm>
          </div>
          <div className="card card-pad stack-sm">
            <h3>Depois de criar</h3>
            <ol className="small muted" style={{ paddingLeft: 18, margin: 0 }}>
              <li>Cadastre a chave da API da Anthropic na configuração da squad.</li>
              <li>Monte a equipe: operadores, membros e leitores, por e-mail.</li>
              <li>Conecte a plataforma de dados em Acesso a dados (o console testa antes de salvar).</li>
              <li>No GitHub, proteja a branch principal (ruleset) exigindo PR e a checagem do harness.</li>
              <li>Abra a primeira feature.</li>
            </ol>
          </div>
        </div>
      </div>
    </>
  );
}
