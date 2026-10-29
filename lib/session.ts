import "server-only";
import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { store, type GlobalRole } from "./db";
import { env } from "./env";
import { OTP } from "./otp";

export type SessionData = {
  uid?: number;
  sv?: number;
  /** e-mail aguardando o código (entre as duas telas de login) */
  pendingEmail?: string;
  next?: string;
};

export type User = { id: number; email: string; name: string; role: GlobalRole; isAdmin: boolean };

export const SESSION_COOKIE = "squad_session";

function options(): SessionOptions {
  return {
    cookieName: SESSION_COOKIE,
    password: env.sessionSecret,
    ttl: OTP.sessionTtlSeconds,
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

/**
 * Usuário logado, relido do banco a cada requisição: desativar a conta ou
 * encerrar sessões (session_version) derruba o acesso na hora.
 */
export const currentUser = cache(async (): Promise<User | null> => {
  const s = await getSession();
  if (!s.uid) return null;
  const u = await (await store()).findUserById(s.uid);
  if (!u || u.status !== "ativo" || u.sessionVersion !== s.sv) return null;
  const isAdmin = u.role === "admin" || env.adminEmails.includes(u.email);
  return { id: u.id, email: u.email, name: u.name || u.email.split("@")[0], role: isAdmin ? "admin" : u.role, isAdmin };
});

export async function requireUser(): Promise<User> {
  const u = await currentUser();
  if (!u) redirect("/login");
  return u;
}

export async function requireAdmin(): Promise<User> {
  const u = await requireUser();
  if (!u.isAdmin) notFound();
  return u;
}
