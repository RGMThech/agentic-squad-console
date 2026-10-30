import { NextResponse } from "next/server";
import { explainDbError, explainGithubError, explainMailError } from "@/lib/diagnose";
import { store } from "@/lib/db";
import { env } from "@/lib/env";
import { appBotLogin, gh } from "@/lib/github";
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
  "GITHUB_ORG",
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
    const o = await gh();
    const bot = await appBotLogin();
    let template = "";
    try {
      const [ow, rp] = env.templateRepo.split("/");
      const t = (await o.repos.get({ owner: ow, repo: rp })).data;
      template = t.is_template ? ` Template ${t.full_name} acessível.` : ` Atenção: ${t.full_name} ainda não está marcado como Template repository.`;
    } catch {
      template = ` Atenção: o App não acessa ${env.templateRepo} (confira SQUAD_TEMPLATE_REPO e a instalação em All repositories).`;
    }
    r.github = { ok: true, detalhe: `App autenticado e instalado em ${env.githubOrg} (bot ${bot}).${template}` };
  } catch (e) {
    console.error("[health] github:", e);
    r.github = { ok: false, detalhe: explainGithubError(e) };
  }

  const ok = Object.values(r).every((x) => x.ok);
  return NextResponse.json({ ok, ...r }, { status: ok ? 200 : 503 });
}
