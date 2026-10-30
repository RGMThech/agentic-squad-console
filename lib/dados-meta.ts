// Metadados das plataformas de dados (sem dependências de servidor: usado também no navegador).

export type Plataforma = "databricks" | "snowflake" | "bigquery" | "fabric";

export type Campo = { k: string; label: string; placeholder: string; hint?: string; opcional?: boolean };
export type Segredo = { nome: string; label: string; placeholder: string; hint?: string; multilinha?: boolean };

export type DadosConfig = {
  plataforma: Plataforma;
  conexao: Record<string, string>;
  leitura: string[];
  /** Schemas de sandbox (banco.schema): um ou vários, ex.: bronze, silver e gold de um catálogo de dev. */
  escrita: string[];
  dbt: boolean;
};

export type MetaPlataforma = {
  rotulo: string;
  guia: string;
  identidade: string;
  campos: Campo[];
  segredos: Segredo[];
  leitura: { label: string; placeholder: string };
  escrita: string;
  dbt: string;
};

export const PLATAFORMAS: Record<Plataforma, MetaPlataforma> = {
  databricks: {
    rotulo: "Databricks",
    guia: "docs/acesso-dados/databricks.md",
    identidade: "service principal",
    campos: [
      { k: "host", label: "Host do workspace", placeholder: "https://adb-1234567890123456.7.azuredatabricks.net", hint: "A URL do navegador até .net ou .com." },
      { k: "warehouse_id", label: "Warehouse ID", placeholder: "a1b2c3d4e5f67890", hint: "Só o ID (está na URL do warehouse), com “Can use” para o service principal." },
    ],
    segredos: [
      { nome: "DATABRICKS_CLIENT_ID", label: "Client ID (Application ID)", placeholder: "00000000-0000-0000-0000-000000000000" },
      { nome: "DATABRICKS_CLIENT_SECRET", label: "Client secret", placeholder: "secret do service principal", hint: "Gerado na aba Secrets do service principal." },
    ],
    leitura: { label: "Leitura (catálogos ou catalogo.schema)", placeholder: "vendas.silver, crm" },
    escrita: "dev_vendas  (catálogo inteiro)",
    dbt: "dbt-databricks",
  },
  snowflake: {
    rotulo: "Snowflake",
    guia: "docs/acesso-dados/snowflake.md",
    identidade: "usuário de serviço",
    campos: [
      { k: "conta", label: "Conta (account identifier)", placeholder: "minhaorg-minhaconta", hint: "Snowsight → Account → View account details." },
      { k: "usuario", label: "Usuário de serviço", placeholder: "SQUAD_SVC" },
      { k: "warehouse", label: "Warehouse", placeholder: "SQUAD_WH" },
      { k: "papel", label: "Papel (role)", placeholder: "SQUAD_ROLE", opcional: true, hint: "Opcional: sem ele, vale o DEFAULT_ROLE do usuário." },
    ],
    segredos: [
      {
        nome: "SNOWFLAKE_PRIVATE_KEY",
        label: "Chave privada (PKCS#8, sem senha)",
        placeholder: "-----BEGIN PRIVATE KEY-----\n…\n-----END PRIVATE KEY-----",
        hint: "Conteúdo inteiro do arquivo .p8. A chave pública fica registrada no usuário.",
        multilinha: true,
      },
    ],
    leitura: { label: "Leitura (databases ou database.schema)", placeholder: "vendas.silver, crm" },
    escrita: "SQUAD_DEV  (database inteiro)",
    dbt: "dbt-snowflake",
  },
  bigquery: {
    rotulo: "BigQuery",
    guia: "docs/acesso-dados/bigquery.md",
    identidade: "service account",
    campos: [
      { k: "projeto", label: "Projeto de execução", placeholder: "meu-projeto", hint: "Executa (e paga) as consultas." },
      { k: "local", label: "Região dos dados", placeholder: "US", opcional: true, hint: "US, EU, southamerica-east1…" },
      { k: "max_gb", label: "Limite por consulta (GB)", placeholder: "10", opcional: true, hint: "Acima disso o BigQuery recusa a consulta sem cobrar." },
    ],
    segredos: [
      {
        nome: "GCP_SA_KEY",
        label: "Chave JSON da service account",
        placeholder: '{ "type": "service_account", "project_id": "…", "private_key": "…", "client_email": "…" }',
        hint: "Conteúdo inteiro do arquivo .json baixado em Keys → Add key.",
        multilinha: true,
      },
    ],
    leitura: { label: "Leitura (projetos ou projeto.dataset)", placeholder: "meu-projeto.vendas, meu-projeto.crm" },
    escrita: "meu-projeto-dev  (projeto inteiro)",
    dbt: "dbt-bigquery",
  },
  fabric: {
    rotulo: "Microsoft Fabric",
    guia: "docs/acesso-dados/fabric.md",
    identidade: "service principal (Entra ID)",
    campos: [
      { k: "servidor", label: "SQL connection string", placeholder: "xxxxxxxx.datawarehouse.fabric.microsoft.com", hint: "Settings do warehouse → SQL endpoint." },
      { k: "banco", label: "Warehouse padrão", placeholder: "squad_dev", hint: "O warehouse da sandbox." },
      { k: "tenant_id", label: "Tenant ID", placeholder: "00000000-0000-0000-0000-000000000000", hint: "Directory (tenant) ID do App registration." },
    ],
    segredos: [
      { nome: "FABRIC_CLIENT_ID", label: "Client ID (Application ID)", placeholder: "00000000-0000-0000-0000-000000000000" },
      { nome: "FABRIC_CLIENT_SECRET", label: "Client secret", placeholder: "Value do client secret", hint: "Certificates & secrets → New client secret." },
    ],
    leitura: { label: "Leitura (warehouses/lakehouses ou item.schema)", placeholder: "fontes, fontes.dbo" },
    escrita: "squad_dev  (warehouse inteiro)",
    dbt: "dbt-fabric",
  },
};

export const LISTA_PLATAFORMAS = Object.keys(PLATAFORMAS) as Plataforma[];

export function ehPlataforma(v: unknown): v is Plataforma {
  return typeof v === "string" && v in PLATAFORMAS;
}

/** Todos os nomes de segredos usados por alguma plataforma. */
export const TODOS_SEGREDOS = LISTA_PLATAFORMAS.flatMap((p) => PLATAFORMAS[p].segredos.map((s) => s.nome));

/** Lê o bloco "dados" do squad.yaml (ou o bloco "databricks" das squads antigas). */
export function lerDados(d: Record<string, unknown>): DadosConfig | null {
  const lista = (v: unknown) =>
    (Array.isArray(v) ? v.map(String) : String(v ?? "").split(","))
      .map((s) => s.trim())
      .filter(Boolean);
  const x = (d.dados ?? null) as Record<string, unknown> | null;
  if (x && typeof x === "object" && ehPlataforma(x.plataforma)) {
    const cx = (x.conexao ?? {}) as Record<string, unknown>;
    return {
      plataforma: x.plataforma,
      conexao: Object.fromEntries(Object.entries(cx && typeof cx === "object" ? cx : {}).map(([k, v]) => [k, String(v ?? "").trim()])),
      leitura: lista(x.leitura),
      escrita: lista(x.escrita),
      dbt: x.dbt === true || String(x.dbt).toLowerCase() === "true",
    };
  }
  const l = (d.databricks ?? null) as Record<string, unknown> | null;
  if (l && typeof l === "object" && (l.host || l.warehouse_id)) {
    return {
      plataforma: "databricks",
      conexao: { host: String(l.host ?? "").trim(), warehouse_id: String(l.warehouse_id ?? "").trim() },
      leitura: lista(l.leitura),
      escrita: lista(l.escrita),
      dbt: x?.dbt === true,
    };
  }
  return null;
}

/** dbt marcado sem plataforma configurada ainda (squad nova). */
export function dbtPedido(d: Record<string, unknown>): boolean {
  const x = (d.dados ?? null) as Record<string, unknown> | null;
  return !!x && (x.dbt === true || String(x.dbt).toLowerCase() === "true");
}
