// Acesso a dados da squad: normalização, validação e teste de conexão por plataforma.
// O console testa as credenciais antes de gravá-las nos segredos do GitHub Actions.

import { createPrivateKey, createPublicKey, createHash, randomUUID, sign } from "node:crypto";
import type { DadosConfig, Plataforma } from "./dados-meta";

const EXEMPLO_SANDBOX: Record<Plataforma, string> = {
  databricks: "squad_dev.agentes",
  snowflake: "squad_dev.agentes",
  bigquery: "meu-projeto.squad_agentes",
  fabric: "squad_dev.agentes",
};

export type Check = { ok: boolean; titulo: string; detalhe: string };
type Fetch = typeof fetch;
type Segredos = Record<string, string>;

const RE_IDENT = /^[A-Za-z_][\w]*$/;
const RE_IDENT_BQ = /^[A-Za-z_][\w-]*$/; // projetos do BigQuery têm hífen

// ----------------------------------------------------------------- normalização

export function normalizeHost(raw: string): string {
  let h = String(raw ?? "").trim().replace(/\/+$/, "");
  if (!h) return "";
  if (!/^https?:\/\//i.test(h)) h = "https://" + h;
  try {
    const u = new URL(h);
    return `${u.protocol}//${u.host}`;
  } catch {
    return "";
  }
}

export function parseLeitura(raw: string): string[] {
  return [
    ...new Set(
      String(raw ?? "")
        .split(/[,\n;]/)
        .map((s) => s.trim().replace(/[`"[\]]/g, "").toLowerCase())
        .filter(Boolean),
    ),
  ];
}

export function normalizeConexao(p: Plataforma, cx: Record<string, string>): Record<string, string> {
  const v = (k: string) => String(cx[k] ?? "").trim();
  switch (p) {
    case "databricks":
      return { host: normalizeHost(v("host")), warehouse_id: v("warehouse_id") };
    case "snowflake": {
      const conta = v("conta").toLowerCase().replace(/^https?:\/\//, "").split("/")[0].replace(/\.snowflakecomputing\.com$/, "");
      const o: Record<string, string> = { conta, usuario: v("usuario").toUpperCase(), warehouse: v("warehouse").toUpperCase() };
      if (v("papel")) o.papel = v("papel").toUpperCase();
      return o;
    }
    case "bigquery": {
      const o: Record<string, string> = { projeto: v("projeto").toLowerCase() };
      if (v("local")) o.local = v("local");
      if (v("max_gb")) o.max_gb = v("max_gb").replace(",", ".");
      return o;
    }
    case "fabric":
      return {
        servidor: v("servidor").replace(/^\w+:\/\//, "").split("/")[0].split(",")[0].replace(/:\d+$/, "").toLowerCase(),
        banco: v("banco"),
        tenant_id: v("tenant_id").toLowerCase(),
      };
  }
}

// ----------------------------------------------------------------- validação

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Valida os campos não secretos; devolve mensagem de erro ou null. */
export function validateDados(c: DadosConfig): string | null {
  const cx = c.conexao;
  const teste = process.env.DBX_TESTE_PERMITE_HTTP === "1";
  switch (c.plataforma) {
    case "databricks":
      if (!cx.host || (!/^https:\/\//.test(cx.host) && !(teste && /^http:\/\/127\.0\.0\.1:/.test(cx.host))))
        return "Host inválido: use a URL do workspace, ex.: https://adb-123.7.azuredatabricks.net";
      if (!/^[a-zA-Z0-9]{8,64}$/.test(cx.warehouse_id ?? "")) return "Warehouse ID inválido: use só o ID (letras e números), não a URL.";
      break;
    case "snowflake":
      if (!/^[a-z0-9][a-z0-9_.-]{2,}$/.test(cx.conta ?? "")) return "Conta inválida: use o account identifier, ex.: minhaorg-minhaconta.";
      if (!RE_IDENT.test(cx.usuario ?? "")) return "Usuário inválido: use o nome do usuário de serviço (letras, números e _).";
      if (!RE_IDENT.test(cx.warehouse ?? "")) return "Warehouse inválido: use o nome do virtual warehouse.";
      if (cx.papel && !RE_IDENT.test(cx.papel)) return "Papel inválido: use o nome do role (letras, números e _).";
      break;
    case "bigquery":
      if (!/^[a-z][a-z0-9-]{4,29}$/.test(cx.projeto ?? "")) return "Projeto inválido: use o ID do projeto (ex.: meu-projeto), não o nome de exibição.";
      if (cx.local && !/^[A-Za-z]+[\w-]*$/.test(cx.local)) return "Região inválida: ex.: US, EU, southamerica-east1.";
      if (cx.max_gb && !(Number(cx.max_gb) > 0 && Number(cx.max_gb) <= 100000)) return "Limite por consulta deve ser um número de GB maior que zero.";
      break;
    case "fabric":
      if (!/^[a-z0-9.-]+\.(fabric\.microsoft\.com|pbidedicated\.windows\.net)$/.test(cx.servidor ?? "") && !(teste && cx.servidor === "127.0.0.1"))
        return "SQL connection string inválida: ex.: xxxxxxxx.datawarehouse.fabric.microsoft.com";
      if (!/^[\w -]+$/.test(cx.banco ?? "")) return "Informe o warehouse padrão (o da sandbox).";
      if (!RE_UUID.test(cx.tenant_id ?? "")) return "Tenant ID inválido: é o Directory (tenant) ID, no formato UUID.";
      break;
  }
  const ident = c.plataforma === "bigquery" ? RE_IDENT_BQ : RE_IDENT;
  for (const l of c.leitura) {
    const p = l.split(".");
    if (p.length > 2 || !p.every((x) => ident.test(x))) return `Leitura inválida: "${l}". Use banco ou banco.schema.`;
  }
  if (c.escrita) {
    const p = c.escrita.split(".");
    if (p.length !== 2 || !p.every((x) => ident.test(x))) return `Escrita (sandbox) deve ser exatamente banco.schema, ex.: ${EXEMPLO_SANDBOX[c.plataforma]}.`;
  }
  return null;
}

/** Valida o formato dos segredos antes de chamar a plataforma. */
export function validateSegredos(p: Plataforma, s: Segredos): string | null {
  if (p === "snowflake") {
    const k = s.SNOWFLAKE_PRIVATE_KEY ?? "";
    if (/ENCRYPTED/.test(k)) return "A chave privada está protegida por senha. Gere com -nocrypt (veja o guia).";
    if (/PUBLIC KEY/.test(k)) return "Esta é a chave pública. Cole a chave privada (arquivo .p8).";
    if (!/-----BEGIN (RSA )?PRIVATE KEY-----/.test(k)) return "Cole a chave privada inteira, com as linhas -----BEGIN PRIVATE KEY----- e -----END PRIVATE KEY-----.";
  }
  if (p === "bigquery") {
    try {
      const j = JSON.parse(s.GCP_SA_KEY ?? "");
      if (j.type !== "service_account" || !j.private_key || !j.client_email) return "O JSON não é a chave de uma service account (type: service_account).";
    } catch {
      return "Cole o conteúdo inteiro do arquivo JSON da service account.";
    }
  }
  if ((p === "databricks" || p === "fabric") && !RE_UUID.test(s[`${p.toUpperCase()}_CLIENT_ID`] ?? ""))
    return "Client ID inválido: é o Application ID, no formato UUID.";
  return null;
}

// ----------------------------------------------------------------- utilidades

function b64url(b: Buffer | string): string {
  return Buffer.from(b).toString("base64url");
}

function jwtRS256(pem: string, payload: Record<string, unknown>): string {
  const key = createPrivateKey(pem.replace(/\\n/g, "\n"));
  const dados = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(JSON.stringify(payload))}`;
  return `${dados}.${b64url(sign("sha256", Buffer.from(dados), key))}`;
}

function baseTeste(): string | null {
  return process.env.DBX_TESTE_PERMITE_HTTP === "1" ? process.env.DADOS_TESTE_URL_BASE || null : null;
}

function conexaoFalhou(m: string): boolean {
  return /fetch failed|ENOTFOUND|getaddrinfo|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN/i.test(m);
}

async function json(r: Response): Promise<Record<string, unknown>> {
  return (await r.json().catch(() => ({}))) as Record<string, unknown>;
}

/** Roda as checagens em sequência; a primeira que falha interrompe as dependentes. */
async function checagens(
  inicial: { titulo: string; fn: () => Promise<string> }[],
  porItem: { titulo: string; fn: () => Promise<string> }[],
): Promise<Check[]> {
  const out: Check[] = [];
  for (const c of inicial) {
    try {
      out.push({ ok: true, titulo: c.titulo, detalhe: await c.fn() });
    } catch (e) {
      const m = (e as Error).message;
      out.push({ ok: false, titulo: c.titulo, detalhe: conexaoFalhou(m) ? "Não foi possível conectar. Confira o endereço informado." : m });
      return out;
    }
    if (out[out.length - 1].detalhe.startsWith("…")) return out; // motor ligando: dados ficam para o próximo teste
  }
  for (const c of porItem) {
    try {
      out.push({ ok: true, titulo: c.titulo, detalhe: await c.fn() });
    } catch (e) {
      out.push({ ok: false, titulo: c.titulo, detalhe: (e as Error).message });
    }
  }
  return out;
}

function semPermissao(msg: string, alvo: string, dica: string): string {
  if (/PERMISSION_DENIED|INSUFFICIENT_PERMISSIONS|does not have|not authorized|Access Denied|accessDenied|permission/i.test(msg)) return `Sem permissão em ${alvo}. ${dica}`;
  if (/NOT_FOUND|not ?found|does not exist|Invalid object name/i.test(msg)) return `${alvo} não existe (ou não está visível para a identidade da squad).`;
  return msg;
}

const contar = (n: number, um: string, varios: string) => `${n}${n >= 20 ? "+" : ""} ${n === 1 ? um : varios} visível(is).`;

// ----------------------------------------------------------------- Databricks

async function testarDatabricks(c: DadosConfig, s: Segredos, f: Fetch): Promise<Check[]> {
  const host = c.conexao.host;
  let tk = "";
  const sql = async (statement: string) => {
    const r = await f(`${host}/api/2.0/sql/statements/`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tk}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        warehouse_id: c.conexao.warehouse_id, statement, wait_timeout: "30s", on_wait_timeout: "CANCEL",
        disposition: "INLINE", format: "JSON_ARRAY", row_limit: 20, query_tags: [{ key: "origem", value: "squad-console-teste" }],
      }),
      cache: "no-store",
    });
    const j = (await json(r)) as { status?: { state?: string; error?: { error_code?: string; message?: string } }; result?: { data_array?: string[][] }; error_code?: string; message?: string };
    if (!r.ok) {
      const msg = `${j.error_code ?? ""} ${j.message ?? ""}`.trim();
      if (r.status === 404 || /does not exist|not found/i.test(msg)) throw new Error(`SQL warehouse não encontrado (${msg}). Confira o Warehouse ID.`);
      if (r.status === 403) throw new Error(`O service principal não tem "Can use" no SQL warehouse ou não tem o direito "Databricks SQL access" (${msg}).`);
      throw new Error(`HTTP ${r.status}: ${msg}`);
    }
    const estado = j.status?.state ?? "DESCONHECIDO";
    if (estado === "SUCCEEDED") return j.result?.data_array ?? [];
    if (estado === "PENDING" || estado === "RUNNING" || estado === "CANCELED") return null;
    throw new Error(j.status?.error ? `${j.status.error.error_code ?? ""} ${j.status.error.message ?? ""}`.trim() : estado);
  };
  const dica = "Conceda USE CATALOG, USE SCHEMA e SELECT ao service principal (guia, passo 4).";
  return checagens(
    [
      {
        titulo: "Autenticação OAuth",
        fn: async () => {
          const r = await f(`${host}/oidc/v1/token`, {
            method: "POST",
            headers: {
              Authorization: "Basic " + Buffer.from(`${s.DATABRICKS_CLIENT_ID}:${s.DATABRICKS_CLIENT_SECRET}`).toString("base64"),
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: "grant_type=client_credentials&scope=all-apis",
            cache: "no-store",
          });
          const j = (await json(r)) as { access_token?: string; error?: string; error_description?: string };
          if (!r.ok || !j.access_token) {
            if (r.status === 401 || j.error === "invalid_client")
              throw new Error("Credenciais recusadas. O Client ID é o Application ID do service principal; confira também se o secret não expirou.");
            throw new Error(`O Databricks não emitiu token (HTTP ${r.status} ${j.error ?? ""} ${j.error_description ?? ""}).`.trim());
          }
          tk = j.access_token;
          return "Service principal autenticado.";
        },
      },
      {
        titulo: "SQL warehouse",
        fn: async () => {
          const l = await sql("SELECT current_user()");
          return l === null ? "…acesso confirmado; o warehouse está ligando (teste de novo em 1–2 minutos para checar os dados)." : `Consulta executada como ${l[0]?.[0] ?? "service principal"}.`;
        },
      },
    ],
    [
      ...c.leitura.map((l) => ({
        titulo: `Leitura em ${l}`,
        fn: async () => {
          const [cat, sch] = l.split(".");
          try {
            const r = await sql(sch ? `SHOW TABLES IN \`${cat}\`.\`${sch}\`` : `SHOW SCHEMAS IN \`${cat}\``);
            return contar(r?.length ?? 0, sch ? "tabela" : "schema", sch ? "tabelas" : "schemas");
          } catch (e) {
            throw new Error(semPermissao((e as Error).message, l, dica));
          }
        },
      })),
      ...(c.escrita ? [{
        titulo: `Sandbox ${c.escrita}`,
        fn: async () => {
          const [cat, sch] = c.escrita.split(".");
          try {
            await sql(`SHOW TABLES IN \`${cat}\`.\`${sch}\``);
            return "Schema acessível. A permissão de criar tabelas é conferida na primeira escrita dos agentes.";
          } catch (e) {
            throw new Error(semPermissao((e as Error).message, c.escrita, "Conceda USE SCHEMA, CREATE TABLE, MODIFY e SELECT na sandbox."));
          }
        },
      }] : []),
    ],
  );
}

// ----------------------------------------------------------------- Snowflake

export function snowflakeJwt(conta: string, usuario: string, pem: string, agora = Math.floor(Date.now() / 1000)): string {
  const pub = createPublicKey(createPrivateKey(pem.replace(/\\n/g, "\n"))).export({ type: "spki", format: "der" });
  const fp = "SHA256:" + createHash("sha256").update(pub).digest("base64");
  let acc = conta.toUpperCase();
  if (acc.includes(".")) acc = acc.split(".")[0];
  const u = usuario.toUpperCase();
  return jwtRS256(pem, { iss: `${acc}.${u}.${fp}`, sub: `${acc}.${u}`, iat: agora, exp: agora + 3540 });
}

async function testarSnowflake(c: DadosConfig, s: Segredos, f: Fetch): Promise<Check[]> {
  const cx = c.conexao;
  const base = baseTeste() || `https://${cx.conta.replace(/_/g, "-")}.snowflakecomputing.com`;
  let tk = "";
  const sql = async (statement: string) => {
    const body: Record<string, unknown> = { statement, timeout: 60, warehouse: cx.warehouse, parameters: { QUERY_TAG: "squad-console-teste", ROWS_PER_RESULTSET: "20" } };
    if (cx.papel) body.role = cx.papel;
    const r = await f(`${base}/api/v2/statements?requestId=${randomUUID()}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tk}`, "X-Snowflake-Authorization-Token-Type": "KEYPAIR_JWT", "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const j = (await json(r)) as { data?: string[][]; message?: string; code?: string };
    if (r.status === 202) return null;
    if (r.status === 401)
      throw new Error("Chave recusada pelo Snowflake: confira conta, usuário e se a chave pública registrada no usuário é par desta chave privada.");
    if (!r.ok) throw new Error(`${j.message ?? `HTTP ${r.status}`}`);
    return j.data ?? [];
  };
  const dica = "Conceda USAGE no database/schema e SELECT nas tabelas ao papel da squad (guia, passo 2).";
  return checagens(
    [
      {
        titulo: "Chave do usuário de serviço",
        fn: async () => {
          tk = snowflakeJwt(cx.conta, cx.usuario, s.SNOWFLAKE_PRIVATE_KEY);
          return "Chave privada lida e token assinado.";
        },
      },
      {
        titulo: "Login e warehouse",
        fn: async () => {
          const l = await sql("SELECT CURRENT_USER(), CURRENT_ROLE(), CURRENT_WAREHOUSE()");
          if (l === null) return "…login aceito; o warehouse está ligando (teste de novo em 1 minuto para checar os dados).";
          if (!l[0]?.[2]) throw new Error(`Login aceito, mas o warehouse ${cx.warehouse} não está disponível para o papel ${l[0]?.[1] ?? ""}: conceda USAGE ON WAREHOUSE.`);
          return `Conectado como ${l[0]?.[0]} (papel ${l[0]?.[1]}, warehouse ${l[0]?.[2]}).`;
        },
      },
    ],
    [
      ...c.leitura.map((l) => ({
        titulo: `Leitura em ${l}`,
        fn: async () => {
          const [db, sch] = l.split(".");
          try {
            const r = await sql(sch ? `SHOW TABLES IN SCHEMA ${db}.${sch}` : `SHOW SCHEMAS IN DATABASE ${db}`);
            return contar(r?.length ?? 0, sch ? "tabela" : "schema", sch ? "tabelas" : "schemas");
          } catch (e) {
            throw new Error(semPermissao((e as Error).message, l, dica));
          }
        },
      })),
      ...(c.escrita ? [{
        titulo: `Sandbox ${c.escrita}`,
        fn: async () => {
          try {
            await sql(`SHOW TABLES IN SCHEMA ${c.escrita}`);
            return "Schema acessível. A permissão de criar tabelas é conferida na primeira escrita dos agentes.";
          } catch (e) {
            throw new Error(semPermissao((e as Error).message, c.escrita, "Conceda USAGE, CREATE TABLE e CREATE VIEW no schema da sandbox."));
          }
        },
      }] : []),
    ],
  );
}

// ----------------------------------------------------------------- BigQuery

async function testarBigQuery(c: DadosConfig, s: Segredos, f: Fetch): Promise<Check[]> {
  const cx = c.conexao;
  const api = baseTeste() || "https://bigquery.googleapis.com/bigquery/v2";
  const chave = JSON.parse(s.GCP_SA_KEY) as { client_email: string; private_key: string; token_uri?: string };
  let tk = "";
  const get = async (path: string) => {
    const r = await f(`${api}${path}`, { headers: { Authorization: `Bearer ${tk}` }, cache: "no-store" });
    const j = (await json(r)) as { error?: { message?: string }; tables?: unknown[]; datasets?: unknown[] };
    if (!r.ok) throw new Error(`${r.status === 403 ? "PERMISSION_DENIED " : r.status === 404 ? "NOT_FOUND " : ""}${j.error?.message ?? `HTTP ${r.status}`}`);
    return j;
  };
  const enc = encodeURIComponent;
  const dica = "Dê BigQuery Data Viewer à service account neste dataset (guia, passo 2).";
  return checagens(
    [
      {
        titulo: "Chave da service account",
        fn: async () => {
          const agora = Math.floor(Date.now() / 1000);
          const uri = chave.token_uri || "https://oauth2.googleapis.com/token";
          const assertion = jwtRS256(chave.private_key, { iss: chave.client_email, scope: "https://www.googleapis.com/auth/bigquery", aud: uri, iat: agora, exp: agora + 3600 });
          const r = await f(uri, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }).toString(),
            cache: "no-store",
          });
          const j = (await json(r)) as { access_token?: string; error?: string; error_description?: string };
          if (!r.ok || !j.access_token)
            throw new Error(j.error === "invalid_grant" ? "Chave recusada pelo Google: ela foi apagada ou desativada. Gere uma nova." : `O Google não emitiu token (${j.error ?? r.status} ${j.error_description ?? ""}).`);
          tk = j.access_token;
          return `Autenticado como ${chave.client_email}.`;
        },
      },
      {
        titulo: `Consultas no projeto ${cx.projeto}`,
        fn: async () => {
          const body: Record<string, unknown> = { query: "SELECT SESSION_USER()", useLegacySql: false, timeoutMs: 30000, labels: { origem: "squad-console-teste" } };
          if (cx.local) body.location = cx.local;
          const r = await f(`${api}/projects/${enc(cx.projeto)}/queries`, {
            method: "POST",
            headers: { Authorization: `Bearer ${tk}`, "Content-Type": "application/json" },
            body: JSON.stringify(body),
            cache: "no-store",
          });
          const j = (await json(r)) as { error?: { message?: string } };
          if (r.status === 403) throw new Error(`A service account não pode rodar consultas em ${cx.projeto}: dê o papel BigQuery Job User no projeto. (${j.error?.message ?? ""})`);
          if (r.status === 404) throw new Error(`Projeto ${cx.projeto} não encontrado. Use o ID do projeto.`);
          if (!r.ok) throw new Error(j.error?.message ?? `HTTP ${r.status}`);
          return `Consulta executada. Limite por consulta: ${cx.max_gb || "10"} GB.`;
        },
      },
    ],
    [
      ...c.leitura.map((l) => ({
        titulo: `Leitura em ${l}`,
        fn: async () => {
          const [p, ds] = l.split(".");
          try {
            if (ds) return contar(((await get(`/projects/${enc(p)}/datasets/${enc(ds)}/tables?maxResults=20`)).tables ?? []).length, "tabela", "tabelas");
            return contar(((await get(`/projects/${enc(p)}/datasets?maxResults=20`)).datasets ?? []).length, "dataset", "datasets");
          } catch (e) {
            throw new Error(semPermissao((e as Error).message, l, dica));
          }
        },
      })),
      ...(c.escrita ? [{
        titulo: `Sandbox ${c.escrita}`,
        fn: async () => {
          const [p, ds] = c.escrita.split(".");
          try {
            await get(`/projects/${enc(p)}/datasets/${enc(ds)}/tables?maxResults=1`);
            return "Dataset acessível. A permissão de criar tabelas (Data Editor) é conferida na primeira escrita dos agentes.";
          } catch (e) {
            throw new Error(semPermissao((e as Error).message, c.escrita, "Crie o dataset e dê BigQuery Data Editor à service account nele."));
          }
        },
      }] : []),
    ],
  );
}

// ----------------------------------------------------------------- Microsoft Fabric

type Linha = unknown[];

async function fabricConsultas(servidor: string, banco: string, token: string, sqls: string[]): Promise<(Linha[] | Error)[]> {
  const { Connection, Request } = await import("tedious");
  const conn = new Connection({
    server: servidor,
    authentication: { type: "azure-active-directory-access-token", options: { token } },
    options: { database: banco, encrypt: true, port: 1433, connectTimeout: 30000, requestTimeout: 60000, appName: "squad-console-teste", rowCollectionOnRequestCompletion: false },
  });
  await new Promise<void>((ok, falha) => {
    conn.on("connect", (err) => (err ? falha(err) : ok()));
    conn.connect();
  });
  const out: (Linha[] | Error)[] = [];
  try {
    for (const sql of sqls) {
      out.push(
        await new Promise<Linha[] | Error>((ok) => {
          const linhas: Linha[] = [];
          const req = new Request(sql, (err) => ok(err ?? linhas));
          req.on("row", (cols: { value: unknown }[]) => linhas.push(cols.map((c) => c.value)));
          conn.execSql(req);
        }),
      );
    }
  } finally {
    conn.close();
  }
  return out;
}

async function testarFabric(c: DadosConfig, s: Segredos, f: Fetch): Promise<Check[]> {
  const cx = c.conexao;
  let tk = "";
  let resultados: (Linha[] | Error)[] = [];
  const q = (n: string) => `[${n.replace(/]/g, "]]")}]`;
  const itens = c.leitura.map((l) => {
    const [db, sch] = l.split(".");
    return `SELECT TOP 20 TABLE_SCHEMA, TABLE_NAME FROM ${q(db)}.INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA NOT IN ('sys','INFORMATION_SCHEMA','queryinsights')${sch ? ` AND TABLE_SCHEMA = '${sch.replace(/'/g, "''")}'` : ""}`;
  });
  const [sdb, ssch] = c.escrita ? c.escrita.split(".") : ["", ""];
  const sqls = ["SELECT SUSER_SNAME(), DB_NAME()", ...itens, ...(c.escrita ? [`SELECT name FROM ${q(sdb)}.sys.schemas WHERE name = '${ssch.replace(/'/g, "''")}'`] : [])];
  const res = (i: number) => {
    const r = resultados[i];
    if (r instanceof Error) throw r;
    return r ?? [];
  };
  return checagens(
    [
      {
        titulo: "Autenticação no Entra ID",
        fn: async () => {
          const base = baseTeste() || "https://login.microsoftonline.com";
          const r = await f(`${base}/${encodeURIComponent(cx.tenant_id)}/oauth2/v2.0/token`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ grant_type: "client_credentials", client_id: s.FABRIC_CLIENT_ID, client_secret: s.FABRIC_CLIENT_SECRET, scope: "https://database.windows.net/.default" }).toString(),
            cache: "no-store",
          });
          const j = (await json(r)) as { access_token?: string; error?: string; error_description?: string };
          if (!r.ok || !j.access_token) {
            const d = String(j.error_description ?? "");
            if (/AADSTS7000215|AADSTS7000222/.test(d)) throw new Error("Client secret inválido ou expirado.");
            if (/AADSTS700016/.test(d)) throw new Error("Aplicativo não encontrado no tenant: confira o Client ID e o Tenant ID.");
            if (/AADSTS90002|AADSTS900023/.test(d)) throw new Error("Tenant não encontrado: confira o Tenant ID.");
            throw new Error(`O Entra ID não emitiu token (${j.error ?? r.status}: ${d.split("\n")[0]}).`);
          }
          tk = j.access_token;
          return "Service principal autenticado.";
        },
      },
      {
        titulo: "Conexão ao SQL endpoint",
        fn: async () => {
          try {
            resultados = await fabricConsultas(cx.servidor, cx.banco, tk, sqls);
          } catch (e) {
            const m = (e as Error).message;
            if (/Login failed|18456/i.test(m))
              throw new Error("O Fabric recusou o login: adicione o aplicativo ao workspace (Contributor) e confira se o tenant libera “Service principals can use Fabric APIs”.");
            if (/Cannot open database|4060/i.test(m)) throw new Error(`Warehouse ${cx.banco} não encontrado neste workspace (ou sem acesso).`);
            throw new Error(conexaoFalhou(m) ? "Não foi possível conectar. Confira a SQL connection string." : m);
          }
          const u = res(0)[0] as unknown[] | undefined;
          return `Conectado como ${u?.[0] ?? "service principal"} em ${u?.[1] ?? cx.banco}.`;
        },
      },
    ],
    [
      ...c.leitura.map((l, i) => ({
        titulo: `Leitura em ${l}`,
        fn: async () => {
          try {
            const n = res(1 + i).length;
            if (n === 0) throw new Error(`NOT_FOUND: nenhuma tabela visível em ${l}`);
            return contar(n, "tabela", "tabelas");
          } catch (e) {
            throw new Error(semPermissao((e as Error).message, l, "O item precisa estar no mesmo workspace (use atalhos num Lakehouse) e o aplicativo precisa de acesso a ele."));
          }
        },
      })),
      ...(c.escrita ? [{
        titulo: `Sandbox ${c.escrita}`,
        fn: async () => {
          try {
            if (res(1 + itens.length).length === 0) throw new Error(`O schema ${ssch} não existe no warehouse ${sdb}: rode CREATE SCHEMA ${ssch}; nele.`);
            return "Schema acessível. A permissão de criar tabelas é conferida na primeira escrita dos agentes.";
          } catch (e) {
            throw new Error(semPermissao((e as Error).message, c.escrita, "Dê ao aplicativo o papel Contributor no workspace da squad."));
          }
        },
      }] : []),
    ],
  );
}

// ----------------------------------------------------------------- entrada

/** Testa autenticação, motor de consulta, leitura e sandbox. Nunca lança: devolve a lista de checagens. */
export async function testConnection(c: DadosConfig, s: Segredos, f: Fetch = fetch): Promise<Check[]> {
  try {
    switch (c.plataforma) {
      case "databricks":
        return await testarDatabricks(c, s, f);
      case "snowflake":
        return await testarSnowflake(c, s, f);
      case "bigquery":
        return await testarBigQuery(c, s, f);
      case "fabric":
        return await testarFabric(c, s, f);
    }
  } catch (e) {
    return [{ ok: false, titulo: "Teste de conexão", detalhe: (e as Error).message }];
  }
}

/** Grava o bloco "dados" no .squad/squad.yaml (preservando o resto e os comentários) e retira o bloco antigo "databricks". */
export function setDadosYaml(text: string, c: DadosConfig, YAML: typeof import("yaml")): string {
  const doc = YAML.parseDocument(text || "");
  if (!doc.contents) doc.contents = doc.createNode({}) as never;
  const valores: Record<string, unknown> = { plataforma: c.plataforma, conexao: c.conexao, leitura: c.leitura, escrita: c.escrita, dbt: c.dbt };
  const node = doc.get("dados");
  if (node && YAML.isMap(node)) {
    for (const [k, v] of Object.entries(valores)) node.set(k, doc.createNode(v));
  } else {
    doc.set("dados", valores);
  }
  if (doc.has("databricks")) doc.delete("databricks");
  if (doc.has("plataforma")) doc.set("plataforma", c.plataforma);
  return String(doc);
}
