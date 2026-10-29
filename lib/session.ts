import "server-only";
import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "./env";

export type SessionData = {
  token?: string;
  login?: string;
  name?: string;
  avatar?: string;
  oauthState?: string;
  next?: string;
};

export type User = { token: string; login: string; name: string; avatar: string };

function options(): SessionOptions {
  return {
    cookieName: "squad_session",
    password: env.sessionSecret,
    ttl: 60 * 60 * 8, // 8 horas
    cookieOptions: {
      secure: env.appUrl.startsWith("https://"),
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    },
  };
}

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), options());
}

export async function currentUser(): Promise<User | null> {
  const s = await getSession();
  if (!s.token || !s.login) return null;
  return { token: s.token, login: s.login, name: s.name || s.login, avatar: s.avatar || "" };
}

export async function requireUser(): Promise<User> {
  const u = await currentUser();
  if (!u) redirect("/");
  return u;
}
