import { test } from "node:test";
import assert from "node:assert/strict";
import { createPrivateKey, createPublicKey, createHash, generateKeyPairSync, verify } from "node:crypto";
import YAML from "yaml";
import { normalizeConexao, normalizeHost, parseLeitura, setDadosYaml, snowflakeJwt, testConnection, validateDados, validateSegredos } from "../lib/dados.ts";
import { lerDados, PLATAFORMAS, TODOS_SEGREDOS } from "../lib/dados-meta.ts";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const PEM = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

test("normaliza conexões de cada plataforma", () => {
  assert.equal(normalizeHost("adb-123.7.azuredatabricks.net/"), "https://adb-123.7.azuredatabricks.net");
  assert.equal(normalizeHost("https://dbc-1.cloud.databricks.com/?o=123#x"), "https://dbc-1.cloud.databricks.com");
  assert.deepEqual(parseLeitura("Vendas.silver, crm\n`crm`, [fontes]"), ["vendas.silver", "crm", "fontes"]);
  assert.deepEqual(normalizeConexao("snowflake", { conta: "https://MinhaOrg-Conta.snowflakecomputing.com/console", usuario: "squad_svc", warehouse: "wh", papel: "" }), {
    conta: "minhaorg-conta", usuario: "SQUAD_SVC", warehouse: "WH",
  });
  assert.deepEqual(normalizeConexao("fabric", { servidor: "abc.datawarehouse.fabric.microsoft.com,1433", banco: "squad_dev", tenant_id: "ABC" }), {
    servidor: "abc.datawarehouse.fabric.microsoft.com", banco: "squad_dev", tenant_id: "abc",
  });
  assert.deepEqual(normalizeConexao("bigquery", { projeto: "Meu-Proj", local: "US", max_gb: "2,5" }), { projeto: "meu-proj", local: "US", max_gb: "2.5" });
});

test("valida campos por plataforma", () => {
  const base = { leitura: ["vendas"], escrita: ["squad_dev.agentes"], dbt: false };
  assert.equal(validateDados({ ...base, plataforma: "databricks", conexao: { host: "https://x.cloud.databricks.com", warehouse_id: "a1b2c3d4e5f6" } }), null);
  assert.match(validateDados({ ...base, plataforma: "databricks", conexao: { host: "https://x", warehouse_id: "/sql/warehouses/abc" } }) ?? "", /Warehouse ID/);
  assert.equal(validateDados({ ...base, plataforma: "snowflake", conexao: { conta: "org-conta", usuario: "SQUAD_SVC", warehouse: "WH" } }), null);
  assert.match(validateDados({ ...base, plataforma: "snowflake", conexao: { conta: "org-conta", usuario: "a b", warehouse: "WH" } }) ?? "", /Usuário/);
  assert.equal(validateDados({ ...base, plataforma: "bigquery", leitura: ["meu-proj.vendas"], escrita: ["meu-proj.sandbox"], conexao: { projeto: "meu-proj" } }), null);
  assert.match(validateDados({ ...base, plataforma: "bigquery", conexao: { projeto: "Meu Projeto" } }) ?? "", /ID do projeto/);
  assert.match(validateDados({ ...base, plataforma: "bigquery", conexao: { projeto: "meu-proj", max_gb: "-1" } }) ?? "", /GB/);
  const fab = { servidor: "abc.datawarehouse.fabric.microsoft.com", banco: "squad_dev", tenant_id: "11111111-2222-3333-4444-555555555555" };
  assert.equal(validateDados({ ...base, plataforma: "fabric", conexao: fab }), null);
  assert.match(validateDados({ ...base, plataforma: "fabric", conexao: { ...fab, tenant_id: "x" } }) ?? "", /Tenant/);
  assert.match(validateDados({ ...base, plataforma: "fabric", conexao: { ...fab, servidor: "evil.com" } }) ?? "", /connection string/);
  assert.match(validateDados({ ...base, plataforma: "databricks", escrita: ["squad_dev"], conexao: { host: "https://x", warehouse_id: "a1b2c3d4e5f6" } }) ?? "", /banco.schema/);
  const dbx = { host: "https://x.cloud.databricks.com", warehouse_id: "a1b2c3d4e5f6" };
  assert.equal(validateDados({ ...base, plataforma: "databricks", leitura: ["e.eleicoes"], escrita: ["e.bronze", "e.silver", "e.gold"], conexao: dbx }), null);
  assert.match(validateDados({ ...base, plataforma: "databricks", leitura: ["e.eleicoes"], escrita: ["e.eleicoes"], conexao: dbx }) ?? "", /separado das fontes/);
});

test("valida o formato dos segredos antes de chamar a plataforma", () => {
  assert.equal(validateSegredos("snowflake", { SNOWFLAKE_PRIVATE_KEY: PEM }), null);
  assert.match(validateSegredos("snowflake", { SNOWFLAKE_PRIVATE_KEY: "-----BEGIN ENCRYPTED PRIVATE KEY-----" }) ?? "", /senha/);
  assert.match(validateSegredos("snowflake", { SNOWFLAKE_PRIVATE_KEY: "-----BEGIN PUBLIC KEY-----" }) ?? "", /pública/);
  assert.match(validateSegredos("bigquery", { GCP_SA_KEY: "{}" }) ?? "", /service account/);
  assert.match(validateSegredos("fabric", { FABRIC_CLIENT_ID: "nome-do-app" }) ?? "", /Client ID/);
});

test("JWT do Snowflake: assinatura e fingerprint da chave pública", () => {
  const tk = snowflakeJwt("minhaorg-conta", "squad_svc", PEM, 1000);
  const [cab, corpo, sig] = tk.split(".");
  const payload = JSON.parse(Buffer.from(corpo, "base64url").toString());
  const pub = createPublicKey(createPrivateKey(PEM));
  const fp = "SHA256:" + createHash("sha256").update(pub.export({ type: "spki", format: "der" })).digest("base64");
  assert.equal(payload.iss, `MINHAORG-CONTA.SQUAD_SVC.${fp}`);
  assert.equal(payload.sub, "MINHAORG-CONTA.SQUAD_SVC");
  assert.equal(payload.exp - payload.iat, 3540);
  assert.ok(verify("sha256", Buffer.from(`${cab}.${corpo}`), pub, Buffer.from(sig, "base64url")));
  assert.match(JSON.parse(Buffer.from(snowflakeJwt("xy12345.us-east-1", "u", PEM).split(".")[1], "base64url").toString()).sub, /^XY12345\.U$/);
});

test("squad.yaml: grava o bloco dados, preserva comentários e aposenta o bloco databricks", () => {
  const original = "# Configuração\nnome: X   # nome\nplataforma: agnostico\nmodelo: sonnet\ndatabricks:\n  host: https://velho\n  warehouse_id: w\n";
  const out = setDadosYaml(original, { plataforma: "snowflake", conexao: { conta: "org-c", usuario: "U", warehouse: "W" }, leitura: ["vendas"], escrita: ["squad_dev.agentes"], dbt: true }, YAML);
  const d = YAML.parse(out);
  assert.equal(d.dados.plataforma, "snowflake");
  assert.equal(d.dados.conexao.conta, "org-c");
  assert.equal(d.dados.dbt, true);
  assert.equal(d.plataforma, "snowflake");
  assert.equal(d.databricks, undefined);
  assert.ok(out.includes("# Configuração") && out.includes("# nome"));
  const tpl = "dados:\n  plataforma: ''   # comentário\n  conexao: {}\n  dbt: false\n";
  const out2 = setDadosYaml(tpl, { plataforma: "bigquery", conexao: { projeto: "p-123" }, leitura: [], escrita: [], dbt: false }, YAML);
  assert.equal(YAML.parse(out2).dados.conexao.projeto, "p-123");
  const out3 = setDadosYaml("", { plataforma: "databricks", conexao: { host: "https://h", warehouse_id: "w" }, leitura: ["e.eleicoes"], escrita: ["e.bronze", "e.silver", "e.gold"], dbt: false }, YAML);
  assert.deepEqual(YAML.parse(out3).dados.escrita, ["e.bronze", "e.silver", "e.gold"]);
  assert.deepEqual(lerDados(YAML.parse(out3))?.escrita, ["e.bronze", "e.silver", "e.gold"]);
  assert.deepEqual(lerDados(YAML.parse(out))?.escrita, ["squad_dev.agentes"]);
});

test("lê o bloco dados e o bloco databricks das squads antigas", () => {
  assert.equal(lerDados({}), null);
  assert.equal(lerDados({ dados: { plataforma: "" } }), null);
  const antigo = lerDados({ databricks: { host: "https://h", warehouse_id: "w", leitura: ["vendas"], escrita: ["a.b"] } });
  assert.equal(antigo?.plataforma, "databricks");
  assert.equal(antigo?.conexao.host, "https://h");
  const novo = lerDados({ dados: { plataforma: "fabric", conexao: { servidor: "s", banco: "b", tenant_id: "t" }, leitura: "x, y", escrita: ["b.agentes"], dbt: true } });
  assert.deepEqual(novo?.leitura, ["x", "y"]);
  assert.equal(novo?.dbt, true);
  assert.equal(TODOS_SEGREDOS.length, 6);
  for (const p of Object.values(PLATAFORMAS)) assert.ok(p.campos.length && p.segredos.length && p.guia.startsWith("docs/acesso-dados/"));
});

// ---- teste de conexão com APIs simuladas (fetch falso)

type Rota = (url: string, init: RequestInit) => [number, unknown];
function fakeFetch(rotas: Record<string, Rota>) {
  const chamadas: { url: string; body: string }[] = [];
  const f = (async (url: string, init: RequestInit = {}) => {
    chamadas.push({ url, body: String(init.body ?? "") });
    const chave = Object.keys(rotas).find((k) => url.includes(k));
    const [st, corpo] = chave ? rotas[chave](url, init) : [404, { message: "rota " + url }];
    return new Response(JSON.stringify(corpo), { status: st, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch;
  return { f, chamadas };
}

test("Snowflake: login, warehouse, leitura e sandbox", async () => {
  process.env.DBX_TESTE_PERMITE_HTTP = "1";
  process.env.DADOS_TESTE_URL_BASE = "http://sf";
  const { f, chamadas } = fakeFetch({
    "/api/v2/statements": (_u, init) => {
      const s = JSON.parse(String(init.body)).statement as string;
      if (s.startsWith("SELECT CURRENT_USER")) return [200, { data: [["SQUAD_SVC", "SQUAD_ROLE", "SQUAD_WH"]] }];
      if (s.includes("FINANCEIRO")) return [422, { message: "Database 'FINANCEIRO' does not exist or not authorized." }];
      return [200, { data: [["t1"], ["t2"]] }];
    },
  });
  const checks = await testConnection(
    { plataforma: "snowflake", conexao: { conta: "org-c", usuario: "SQUAD_SVC", warehouse: "SQUAD_WH", papel: "SQUAD_ROLE" }, leitura: ["vendas.silver", "FINANCEIRO"], escrita: ["squad_dev.agentes"], dbt: false },
    { SNOWFLAKE_PRIVATE_KEY: PEM },
    f,
  );
  assert.deepEqual(checks.map((c) => c.ok), [true, true, true, false, true]);
  assert.match(checks[3].detalhe, /Sem permissão em FINANCEIRO/);
  assert.equal(JSON.parse(chamadas[0].body).role, "SQUAD_ROLE");
});

test("Snowflake: chave errada é explicada", async () => {
  const { f } = fakeFetch({ "/api/v2/statements": () => [401, { message: "JWT token is invalid." }] });
  const checks = await testConnection({ plataforma: "snowflake", conexao: { conta: "o-c", usuario: "U", warehouse: "W" }, leitura: [], escrita: [], dbt: false }, { SNOWFLAKE_PRIVATE_KEY: PEM }, f);
  assert.equal(checks.at(-1)?.ok, false);
  assert.match(checks.at(-1)?.detalhe ?? "", /Chave recusada/);
});

test("BigQuery: token da service account, consulta e datasets", async () => {
  process.env.DADOS_TESTE_URL_BASE = "http://bq";
  const sa = JSON.stringify({ type: "service_account", client_email: "squad@p.iam.gserviceaccount.com", private_key: PEM, token_uri: "http://google/token" });
  const { f, chamadas } = fakeFetch({
    "google/token": (_u, init) => {
      const a = new URLSearchParams(String(init.body)).get("assertion") ?? "";
      const payload = JSON.parse(Buffer.from(a.split(".")[1], "base64url").toString());
      assert.equal(payload.scope, "https://www.googleapis.com/auth/bigquery");
      return [200, { access_token: "g" }];
    },
    "/projects/meu-proj/queries": () => [200, { jobComplete: true }],
    "/datasets/vendas/tables": () => [200, { tables: [{}, {}, {}] }],
    "/datasets/rh/tables": () => [403, { error: { message: "Access Denied: Dataset meu-proj:rh" } }],
    "/datasets/sandbox/tables": () => [200, {}],
  });
  const checks = await testConnection(
    { plataforma: "bigquery", conexao: { projeto: "meu-proj", local: "US" }, leitura: ["meu-proj.vendas", "meu-proj.rh"], escrita: ["meu-proj.sandbox"], dbt: false },
    { GCP_SA_KEY: sa },
    f,
  );
  assert.deepEqual(checks.map((c) => c.ok), [true, true, true, false, true]);
  assert.match(checks[2].detalhe, /^3 tabelas/);
  assert.match(checks[3].detalhe, /Sem permissão em meu-proj.rh/);
  assert.equal(JSON.parse(chamadas.find((c) => c.url.endsWith("/queries"))!.body).location, "US");
});

test("Fabric: secret inválido para no Entra ID, sem tentar o SQL", async () => {
  process.env.DADOS_TESTE_URL_BASE = "http://login";
  const { f } = fakeFetch({ "/oauth2/v2.0/token": () => [401, { error: "invalid_client", error_description: "AADSTS7000215: Invalid client secret provided." }] });
  const checks = await testConnection(
    { plataforma: "fabric", conexao: { servidor: "abc.datawarehouse.fabric.microsoft.com", banco: "squad_dev", tenant_id: "t" }, leitura: ["fontes"], escrita: ["squad_dev.agentes"], dbt: false },
    { FABRIC_CLIENT_ID: "11111111-2222-3333-4444-555555555555", FABRIC_CLIENT_SECRET: "x" },
    f,
  );
  assert.equal(checks.length, 1);
  assert.match(checks[0].detalhe, /Client secret inválido/);
});

test("Databricks continua igual", async () => {
  const { f } = fakeFetch({
    "/oidc/v1/token": () => [200, { access_token: "t" }],
    "/api/2.0/sql/statements/": (_u, init) => {
      const s = JSON.parse(String(init.body)).statement as string;
      return s.includes("current_user") ? [200, { status: { state: "SUCCEEDED" }, result: { data_array: [["sp"]] } }] : [200, { status: { state: "SUCCEEDED" }, result: { data_array: [["a"], ["b"]] } }];
    },
  });
  const checks = await testConnection(
    { plataforma: "databricks", conexao: { host: "https://x", warehouse_id: "w1234567" }, leitura: ["vendas"], escrita: ["squad_dev.agentes"], dbt: false },
    { DATABRICKS_CLIENT_ID: "a", DATABRICKS_CLIENT_SECRET: "b" },
    f,
  );
  assert.deepEqual(checks.map((c) => c.ok), [true, true, true, true]);
});
