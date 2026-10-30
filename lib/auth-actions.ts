"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { store } from "./db";
import { explainDbError, explainMailError } from "./diagnose";
import { env } from "./env";
import { sendLoginCode } from "./mail";
import { OTP, cleanCode, generateCode, hashCode, isValidEmail, normalizeEmail, safeNext, sameHash } from "./otp";
import { getSession } from "./session";

export type LoginState = { error?: string; message?: string };

async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] || h.get("x-real-ip") || "").trim().slice(0, 64);
}

/** Erro de infraestrutura → mensagem útil ao administrador, sem expor segredos. */
function falhaInfra(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  if (/SESSION_SECRET/.test(m)) return "Configuração incompleta: SESSION_SECRET ausente ou curto (mínimo 32 caracteres).";
  if (/E-mail não configurado|SMTP|EAUTH|ESOCKET|ECONNECTION/.test(m) || (e as { responseCode?: number })?.responseCode)
    return "Falha no envio do e-mail: " + explainMailError(e) + " Diagnóstico completo em /api/health?verificar=1.";
  return "O console não conseguiu acessar o banco de dados: " + explainDbError(e) + " Diagnóstico completo em /api/health?verificar=1.";
}

const GENERICO = "Se este e-mail tiver acesso, você receberá um código em instantes.";

/** Passo 1: pede o código. A resposta é a mesma exista ou não a conta (não revela quem tem acesso). */
export async function requestCode(_: LoginState, fd: FormData): Promise<LoginState> {
  try {
    const email = normalizeEmail(String(fd.get("email") ?? "") || (await getSession()).pendingEmail || "");
    const next = safeNext(String(fd.get("next") ?? ""));
    if (!isValidEmail(email)) return { error: "Informe um e-mail válido." };

    const db = await store();
    const ip = await clientIp();
    const since = new Date(Date.now() - OTP.windowMs);
    const [porEmail, porIp] = await Promise.all([db.countCodesSince({ email }, since), ip ? db.countCodesSince({ ip }, since) : 0]);
    if (porEmail >= OTP.maxPerEmail || porIp >= OTP.maxPerIp) {
      return { error: "Muitos pedidos de código em pouco tempo. Aguarde 15 minutos e tente de novo." };
    }

    let user = await db.findUserByEmail(email);
    // administradores iniciais (ADMIN_EMAILS) entram sem convite: a conta nasce no primeiro acesso
    if (!user && env.adminEmails.includes(email)) {
      user = await db.createUser({ email, name: "", role: "admin", invitedBy: "ADMIN_EMAILS" });
      await db.audit({ actor: email, action: "usuario.bootstrap_admin", target: email, ip });
    }

    if (user && user.status === "ativo") {
      const code = generateCode();
      await db.insertCode({ email, codeHash: hashCode(code, email, env.sessionSecret), ip, expiresAt: new Date(Date.now() + OTP.ttlMs) });
      try {
        await sendLoginCode(email, code);
      } catch (e) {
        console.error("[login] falha ao enviar e-mail:", e);
        return { error: "Não foi possível enviar o e-mail: " + explainMailError(e) + " Diagnóstico completo em /api/health?verificar=1." };
      }
      await db.audit({ actor: email, action: "login.codigo_enviado", ip });
    } else {
      // conta inexistente ou desativada: registra, mas responde igual
      await db.insertCode({ email, codeHash: "0".repeat(64), ip, expiresAt: new Date(0) });
      await db.audit({ actor: email, action: "login.codigo_negado", ip });
    }

    const s = await getSession();
    s.pendingEmail = email;
    s.next = next;
    s.uid = undefined;
    s.sv = undefined;
    await s.save();
  } catch (e) {
    console.error("[login] pedir código:", e);
    return { error: falhaInfra(e) };
  }
  if (fd.get("reenviar")) return { message: "Enviamos um novo código. " + GENERICO };
  redirect("/login/codigo");
}

/** Passo 2: confere o código e abre a sessão. */
export async function verifyCode(_: LoginState, fd: FormData): Promise<LoginState> {
  let user: Awaited<ReturnType<Awaited<ReturnType<typeof store>>["findUserByEmail"]>> = null;
  const s = await getSession();
  try {
    const email = s.pendingEmail;
    if (!email) return { error: "Sessão de login expirada. Informe seu e-mail de novo." };
    const code = cleanCode(String(fd.get("code") ?? ""));
    if (code.length !== 6) return { error: "O código tem 6 dígitos." };

    const db = await store();
    const ip = await clientIp();
    const ativo = await db.latestActiveCode(email, new Date());
    const invalido = "Código inválido ou expirado. Confira o e-mail mais recente ou peça um novo código.";
    if (!ativo || ativo.attempts >= OTP.maxAttempts) return { error: invalido };

    await db.bumpCodeAttempts(ativo.id);
    if (!sameHash(ativo.codeHash, hashCode(code, email, env.sessionSecret))) {
      await db.audit({ actor: email, action: "login.codigo_errado", ip });
      const restantes = OTP.maxAttempts - (ativo.attempts + 1);
      return { error: restantes > 0 ? `Código incorreto. Restam ${restantes} tentativa(s).` : invalido };
    }

    user = await db.findUserByEmail(email);
    if (!user || user.status !== "ativo") return { error: invalido };
    await db.consumeCodes(email, new Date());
    await db.updateUser(user.id, { touchLogin: true });
    await db.audit({ actor: email, action: "login.sucesso", ip });

  } catch (e) {
    console.error("[login] conferir código:", e);
    return { error: falhaInfra(e) };
  }
  if (!user) return { error: "Código inválido ou expirado." };
  const destino = safeNext(s.next);
  s.uid = user.id;
  s.sv = user.sessionVersion;
  s.pendingEmail = undefined;
  s.next = undefined;
  await s.save();
  redirect(destino);
}

/** Volta para a tela de e-mail (trocar o endereço). */
export async function cancelLogin(): Promise<void> {
  const s = await getSession();
  s.pendingEmail = undefined;
  await s.save();
  redirect("/login");
}
