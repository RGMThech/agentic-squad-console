// Teste de conexão com o Databricks (OAuth M2M + SQL Statement Execution API).
// Usado pelo console antes de gravar as credenciais da squad.

export type DbxConfig = { host: string; warehouseId: string; leitura: string[]; escrita: string };
export type Check = { ok: boolean; titulo: string; detalhe: string };

const RE_IDENT = /^[A-Za-z_][\w]*$/;

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
        .map((s) => s.trim().replace(/`/g, "").toLowerCase())
        .filter(Boolean),
    ),
  ];
}

/** Valida os campos não secretos; devolve mensagem de erro ou null. */
export function validateDbxConfig(c: DbxConfig): string | null {
  const http = process.env.DBX_TESTE_PERMITE_HTTP === "1" && /^http:\/\/127\.0\.0\.1:/.test(c.host); // só testes locais
  if (!c.host || (!/^https:\/\//.test(c.host) && !http)) return "Host inválido: use a URL do workspace, ex.: https://adb-123.7.azuredatabricks.net";
  if (!/^[a-zA-Z0-9]{8,64}$/.test(c.warehouseId)) return "Warehouse ID inválido: use só o ID (letras e números), não a URL.";
  for (const l of c.leitura) {
    const p = l.split(".");
    if (p.length > 2 || !p.every((x) => RE_IDENT.test(x))) return `Leitura inválida: "${l}". Use catalogo ou catalogo.schema.`;
  }
  if (c.escrita) {
    const p = c.escrita.split(".");
    if (p.length !== 2 || !p.every((x) => RE_IDENT.test(x))) return 'Escrita (sandbox) deve ser exatamente catalogo.schema, ex.: squad_dev.agentes.';
  }
  return null;
}

type Fetch = typeof fetch;

async function token(c: DbxConfig, id: string, secret: string, f: Fetch): Promise<string> {
  const r = await f(`${c.host}/oidc/v1/token`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials&scope=all-apis",
    cache: "no-store",
  });
  const j = (await r.json().catch(() => ({}))) as { access_token?: string; error?: string; error_description?: string };
  if (!r.ok || !j.access_token) {
    if (r.status === 401 || j.error === "invalid_client")
      throw new Error("Credenciais recusadas. O Client ID é o Application ID do service principal; confira também se o secret não expirou.");
    throw new Error(`O Databricks não emitiu token (HTTP ${r.status} ${j.error ?? ""} ${j.error_description ?? ""}).`.trim());
  }
  return j.access_token;
}

async function sql(c: DbxConfig, tk: string, statement: string, f: Fetch): Promise<{ estado: string; linhas: string[][]; erro?: string }> {
  const r = await f(`${c.host}/api/2.0/sql/statements/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tk}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      warehouse_id: c.warehouseId,
      statement,
      wait_timeout: "30s",
      on_wait_timeout: "CANCEL",
      disposition: "INLINE",
      format: "JSON_ARRAY",
      row_limit: 20,
      query_tags: [{ key: "origem", value: "squad-console-teste" }],
    }),
    cache: "no-store",
  });
  const j = (await r.json().catch(() => ({}))) as {
    status?: { state?: string; error?: { error_code?: string; message?: string } };
    result?: { data_array?: string[][] };
    error_code?: string;
    message?: string;
  };
  if (!r.ok) {
    const msg = `${j.error_code ?? ""} ${j.message ?? ""}`.trim();
    if (r.status === 404 || /does not exist|not found/i.test(msg)) throw new Error(`SQL warehouse não encontrado (${msg}). Confira o Warehouse ID.`);
    if (r.status === 403) throw new Error(`O service principal não tem "Can use" no SQL warehouse ou não tem o direito "Databricks SQL access" (${msg}).`);
    throw new Error(`HTTP ${r.status}: ${msg}`);
  }
  const estado = j.status?.state ?? "DESCONHECIDO";
  const erro = j.status?.error ? `${j.status.error.error_code ?? ""} ${j.status.error.message ?? ""}`.trim() : undefined;
  return { estado, linhas: j.result?.data_array ?? [], erro };
}

/** Testa autenticação, warehouse, leitura e sandbox. Nunca lança: devolve a lista de checagens. */
export async function testConnection(c: DbxConfig, clientId: string, secret: string, f: Fetch = fetch): Promise<Check[]> {
  const checks: Check[] = [];
  let tk = "";
  try {
    tk = await token(c, clientId, secret, f);
    checks.push({ ok: true, titulo: "Autenticação OAuth", detalhe: "Service principal autenticado." });
  } catch (e) {
    const m = (e as Error).message;
    checks.push({ ok: false, titulo: "Autenticação OAuth", detalhe: /fetch failed|ENOTFOUND|getaddrinfo/i.test(m) ? "Não foi possível conectar ao host. Confira a URL do workspace." : m });
    return checks;
  }

  try {
    const r = await sql(c, tk, "SELECT current_user()", f);
    if (r.estado === "SUCCEEDED") checks.push({ ok: true, titulo: "SQL warehouse", detalhe: `Consulta executada como ${r.linhas[0]?.[0] ?? "service principal"}.` });
    else if (r.estado === "PENDING" || r.estado === "RUNNING" || r.estado === "CANCELED")
      checks.push({ ok: true, titulo: "SQL warehouse", detalhe: "Acesso confirmado; o warehouse está ligando (tente o teste de novo em 1–2 minutos para checar os dados)." });
    else checks.push({ ok: false, titulo: "SQL warehouse", detalhe: r.erro ?? r.estado });
    if (r.estado !== "SUCCEEDED") return checks;
  } catch (e) {
    checks.push({ ok: false, titulo: "SQL warehouse", detalhe: (e as Error).message });
    return checks;
  }

  for (const l of c.leitura) {
    const [cat, sch] = l.split(".");
    const stmt = sch ? `SHOW TABLES IN \`${cat}\`.\`${sch}\`` : `SHOW SCHEMAS IN \`${cat}\``;
    try {
      const r = await sql(c, tk, stmt, f);
      checks.push(
        r.estado === "SUCCEEDED"
          ? { ok: true, titulo: `Leitura em ${l}`, detalhe: `${r.linhas.length}${r.linhas.length === 20 ? "+" : ""} ${sch ? "tabela(s)" : "schema(s)"} visível(is).` }
          : { ok: false, titulo: `Leitura em ${l}`, detalhe: semPermissao(r.erro ?? r.estado, l) },
      );
    } catch (e) {
      checks.push({ ok: false, titulo: `Leitura em ${l}`, detalhe: (e as Error).message });
    }
  }

  if (c.escrita) {
    const [cat, sch] = c.escrita.split(".");
    try {
      const r = await sql(c, tk, `SHOW TABLES IN \`${cat}\`.\`${sch}\``, f);
      checks.push(
        r.estado === "SUCCEEDED"
          ? { ok: true, titulo: `Sandbox ${c.escrita}`, detalhe: "Schema acessível. A permissão de criar tabelas é conferida na primeira escrita dos agentes." }
          : { ok: false, titulo: `Sandbox ${c.escrita}`, detalhe: semPermissao(r.erro ?? r.estado, c.escrita) },
      );
    } catch (e) {
      checks.push({ ok: false, titulo: `Sandbox ${c.escrita}`, detalhe: (e as Error).message });
    }
  }
  return checks;
}

function semPermissao(msg: string, alvo: string): string {
  if (/PERMISSION_DENIED|INSUFFICIENT_PERMISSIONS|does not have|USE CATALOG|USE SCHEMA/i.test(msg))
    return `Sem permissão em ${alvo}. Conceda USE CATALOG, USE SCHEMA e SELECT ao service principal (docs/databricks.md, passo 4).`;
  if (/NOT_FOUND|not found|does not exist/i.test(msg)) return `${alvo} não existe (ou não está visível ao service principal).`;
  return msg;
}

/** Atualiza (ou cria) o bloco "databricks" do .squad/squad.yaml preservando o resto e os comentários. */
export function setDatabricksYaml(text: string, c: DbxConfig, YAML: typeof import("yaml")): string {
  const doc = YAML.parseDocument(text || "");
  if (!doc.contents) doc.contents = doc.createNode({}) as never;
  const node = doc.get("databricks");
  const valores: Record<string, unknown> = { host: c.host, warehouse_id: c.warehouseId, leitura: c.leitura, escrita: c.escrita };
  if (node && YAML.isMap(node)) {
    for (const [k, v] of Object.entries(valores)) node.set(k, v);
  } else {
    doc.set("databricks", valores);
  }
  return String(doc);
}
