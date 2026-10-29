import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { gh } from "@/lib/github";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

function fail(motivo: string) {
  return NextResponse.redirect(`${env.appUrl}/?erro=${encodeURIComponent(motivo)}`);
}

function sameState(a?: string, b?: string | null) {
  if (!a || !b || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const session = await getSession();
  const expected = session.oauthState;
  session.oauthState = undefined;

  if (params.get("error")) return fail("O acesso ao GitHub foi cancelado.");
  if (!sameState(expected, params.get("state"))) return fail("Sessão de login expirada. Tente novamente.");

  const tokenRes = await fetch(`${env.githubUrl}/login/oauth/access_token`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: env.clientId,
      client_secret: env.clientSecret,
      code: params.get("code"),
      redirect_uri: `${env.appUrl}/api/auth/callback`,
    }),
    cache: "no-store",
  });
  const tokenJson = (await tokenRes.json().catch(() => ({}))) as { access_token?: string };
  if (!tokenJson.access_token) return fail("Não foi possível concluir o login com o GitHub.");

  const o = gh(tokenJson.access_token);
  const me = (await o.users.getAuthenticated()).data;

  const users = env.allowedUsers;
  const orgs = env.allowedOrgs;
  if (users.length || orgs.length) {
    let permitido = users.includes(me.login.toLowerCase());
    if (!permitido && orgs.length) {
      const minhas = await o.paginate(o.orgs.listForAuthenticatedUser, { per_page: 100 });
      permitido = minhas.some((org) => orgs.includes(org.login.toLowerCase()));
    }
    if (!permitido) return fail(`A conta @${me.login} não tem acesso a este console.`);
  }

  session.token = tokenJson.access_token;
  session.login = me.login;
  session.name = me.name ?? me.login;
  session.avatar = me.avatar_url;
  const next = session.next || "/squads";
  session.next = undefined;
  await session.save();
  return NextResponse.redirect(`${env.appUrl}${next}`);
}
