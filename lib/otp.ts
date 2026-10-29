// Regras do login por código (lógica pura, testada em tests/otp.test.ts).
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

export const OTP = {
  /** Validade do código. */
  ttlMs: 10 * 60 * 1000,
  /** Tentativas erradas antes de o código ser invalidado. */
  maxAttempts: 5,
  /** Janela das regras de limite. */
  windowMs: 15 * 60 * 1000,
  /** Códigos pedidos por e-mail na janela. */
  maxPerEmail: 3,
  /** Códigos pedidos por IP na janela. */
  maxPerIp: 10,
  /** Duração da sessão depois do login. */
  sessionTtlSeconds: 12 * 60 * 60,
} as const;

const RE_EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,63}$/;

export function normalizeEmail(raw: string): string {
  return String(raw ?? "").trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return email.length <= 254 && RE_EMAIL.test(email);
}

export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** O código nunca é guardado em texto: só o HMAC ligado ao e-mail. */
export function hashCode(code: string, email: string, secret: string): string {
  return createHmac("sha256", secret).update(`${normalizeEmail(email)}:${code}`).digest("hex");
}

export function sameHash(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

export function cleanCode(raw: string): string {
  return String(raw ?? "").replace(/\D/g, "").slice(0, 6);
}

/** Caminho de retorno seguro após o login (evita redirecionamento aberto). */
export function safeNext(next: string | null | undefined, fallback = "/squads"): string {
  const n = String(next ?? "");
  if (!n.startsWith("/") || n.startsWith("//") || n.startsWith("/\\") || n.startsWith("/login")) return fallback;
  return n;
}
