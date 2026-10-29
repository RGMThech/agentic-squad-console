import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { env } from "@/lib/env";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// Escopos: repo (ler/escrever repositórios da squad), workflow (acionar e editar workflows), read:org (listar organizações)
const SCOPES = "read:user repo workflow read:org";

export async function GET(req: Request) {
  const session = await getSession();
  session.oauthState = randomBytes(24).toString("base64url");
  const next = new URL(req.url).searchParams.get("next") ?? "";
  session.next = next.startsWith("/") && !next.startsWith("//") ? next : "/squads";
  await session.save();

  const url = new URL(`${env.githubUrl}/login/oauth/authorize`);
  url.searchParams.set("client_id", env.clientId);
  url.searchParams.set("redirect_uri", `${env.appUrl}/api/auth/callback`);
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("state", session.oauthState);
  url.searchParams.set("allow_signup", "false");
  return NextResponse.redirect(url);
}
