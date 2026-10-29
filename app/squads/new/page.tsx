import { ActionForm } from "@/components/ActionForm";
import { PageHead } from "@/components/Shell";
import { createSquad } from "@/lib/actions";
import { env } from "@/lib/env";
import { requireAdmin } from "@/lib/session";

export const metadata = { title: "Nova squad" };

export default async function NewSquadPage() {
  await requireAdmin();
  const org = env.githubOrg;

  return (
    <>
      <PageHead
        title="Nova squad"
        crumbs={[{ href: "/squads", label: "Squads" }, { label: "Nova" }]}
        subtitle={`Cria um repositório privado em ${org} a partir do template ${env.templateRepo}, com você como operador.`}
      />
      <div className="content">
        <div className="split">
          <div className="card card-pad">
            <ActionForm action={createSquad} submit="Criar squad" pending="Criando repositório…">
              <div className="field">
                <label htmlFor="nome">Nome do repositório</label>
                <div className="input-prefix">
                  <span>{org} /</span>
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
                    <option value="dbt">dbt</option>
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
            </ActionForm>
          </div>
          <div className="card card-pad stack-sm">
            <h3>Depois de criar</h3>
            <ol className="small muted" style={{ paddingLeft: 18, margin: 0 }}>
              <li>Cadastre a chave da API da Anthropic na configuração da squad.</li>
              <li>Monte a equipe: operadores, membros e leitores, por e-mail.</li>
              <li>No GitHub, proteja a branch principal (ruleset) exigindo PR e a checagem do harness.</li>
              <li>Abra a primeira feature.</li>
            </ol>
          </div>
        </div>
      </div>
    </>
  );
}
