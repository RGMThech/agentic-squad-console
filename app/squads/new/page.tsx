import { ActionForm } from "@/components/ActionForm";
import { PageHead } from "@/components/Shell";
import { createSquad } from "@/lib/actions";
import { env } from "@/lib/env";
import { gh } from "@/lib/github";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Nova squad" };

export default async function NewSquadPage() {
  const user = await requireUser();
  const orgs = await gh(user.token)
    .orgs.listForAuthenticatedUser({ per_page: 100 })
    .then((r) => r.data.map((o) => o.login))
    .catch(() => [] as string[]);

  return (
    <>
      <PageHead
        title="Nova squad"
        crumbs={[{ href: "/squads", label: "Squads" }, { label: "Nova" }]}
        subtitle={`Cria um repositório privado a partir do template ${env.templateRepo}, com você como operador.`}
      />
      <div className="content">
        <div className="split">
          <div className="card card-pad">
            <ActionForm action={createSquad} submit="Criar squad" pending="Criando repositório…">
              <div className="grid grid-2">
                <div className="field">
                  <label htmlFor="owner">Dono do repositório</label>
                  <select id="owner" name="owner" className="select" defaultValue={user.login}>
                    <option value={user.login}>{user.login} (pessoal)</option>
                    {orgs.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="nome">Nome do repositório</label>
                  <input id="nome" name="nome" className="input" required placeholder="squad-serasa-datalake" pattern="[A-Za-z0-9._-]+" />
                </div>
              </div>
              <div className="grid grid-2">
                <div className="field">
                  <label htmlFor="titulo">Nome de exibição</label>
                  <input id="titulo" name="titulo" className="input" placeholder="Data Lake Serasa" />
                </div>
                <div className="field">
                  <label htmlFor="cliente">Cliente</label>
                  <input id="cliente" name="cliente" className="input" placeholder="Serasa Experian" />
                </div>
              </div>
              <div className="field">
                <label htmlFor="descricao">Descrição</label>
                <input id="descricao" name="descricao" className="input" placeholder="Reconstrução do Data Lake em Databricks" />
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
              <li>Adicione o time em Equipe e papéis.</li>
              <li>No GitHub, proteja a branch principal exigindo PR e a checagem <code>squad-gates</code>.</li>
              <li>Abra a primeira feature.</li>
            </ol>
          </div>
        </div>
      </div>
    </>
  );
}
