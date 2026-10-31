import { NextResponse } from "next/server";
import { explainDbError, explainGithubError, explainMailError } from "@/lib/diagnose";
import { store } from "@/lib/db";
import { env } from "@/lib/env";
import { listarConexoes } from "@/lib/github";
import { diagnosticar, resumoDiagnostico } from "@/lib/conexoes";
import { verifyMail } from "@/lib/mail";

export const dynamic = "force-dynamic";

type Item = { ok: boolean; detalhe: string };

const OBRIGATORIAS = [
  "APP_URL",
  "SESSION_SECRET",
  "DATABASE_URL",
  "SMTP_HOST",
  "SMTP_USER",
  "SMTP_PASS",
  "ADMIN_EMAILS",
  "GITHUB_APP_ID",
  "GITHUB_APP_PRIVATE_KEY",
];

/**
 * GET /api/health            → { ok }
 * GET /api/health?verificar=1 → checa variáveis, MySQL, e-mail e GitHub App.
 * As mensagens nunca incluem senhas, hosts ou chaves.
 */
export async function GET(req: Request) {
  if (!new URL(req.url).searchParams.has("verificar")) {
    return NextResponse.json({ ok: true, servico: "squad-console" });
  }

  const r: Record<string, Item> = {};

  const faltando = OBRIGATORIAS.filter((k) => !process.env[k]);
  const antigas = ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET", "ALLOWED_GITHUB_USERS", "ALLOWED_GITHUB_ORGS", "GITHUB_URL"].filter((k) => process.env[k] !== undefined);
  let detalheVars = faltando.length ? `Faltando: ${faltando.join(", ")}.` : "Todas definidas.";
  if ((process.env.SESSION_SECRET ?? "").length > 0 && (process.env.SESSION_SECRET ?? "").length < 32) detalheVars += " SESSION_SECRET precisa de 32+ caracteres.";
  if (process.env.APP_URL && /\/$/.test(process.env.APP_URL)) detalheVars += " APP_URL não deve terminar com barra.";
  if (antigas.length) detalheVars += ` Variáveis antigas que podem ser apagadas: ${antigas.join(", ")}.`;
  r.variaveis = { ok: faltando.length === 0 && (process.env.SESSION_SECRET ?? "").length >= 32, detalhe: detalheVars };

  try {
    const db = await store();
    const n = (await db.listUsers()).length;
    r.mysql = { ok: true, detalhe: `Conectado. Tabelas prontas. ${n} conta(s).` };
  } catch (e) {
    console.error("[health] mysql:", e);
    r.mysql = { ok: false, detalhe: explainDbError(e) };
  }

  try {
    await verifyMail();
    r.email = { ok: true, detalhe: env.mailTransport === "smtp" ? "Servidor de e-mail aceitou o login." : "Modo console (desenvolvimento)." };
  } catch (e) {
    console.error("[health] email:", e);
    r.email = { ok: false, detalhe: explainMailError(e) };
  }

  try {
    const conexoes = (await listarConexoes()).filter((c) => c.ativo);
    if (!conexoes.length) {
      r.github = { ok: false, detalhe: "Nenhuma organização do GitHub conectada. Conecte em Admin → Conexões (ou defina GITHUB_ORG)." };
    } else {
      const ds = await Promise.all(conexoes.map(async (c) => ({ c, d: await diagnosticar(c) })));
      r.github = { ok: ds.every((x) => x.d.ok), detalhe: ds.map((x) => resumoDiagnostico(x.c, x.d)).join(" | ") };
    }
  } catch (e) {
    console.error("[health] github:", e);
    r.github = { ok: false, detalhe: explainGithubError(e) };
  }

  const ok = Object.values(r).every((x) => x.ok);
  return NextResponse.json({ ok, ...r }, { status: ok ? 200 : 503 });
}
