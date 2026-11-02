"use server";

import { headers } from "next/headers";
import { store } from "./db";
import { env } from "./env";
import { sendPedidoConvite } from "./mail";
import { isValidEmail, normalizeEmail } from "./otp";

export type ConviteState = { ok?: boolean; error?: string };

// limite simples em memória: evita abuso do formulário público
const g = globalThis as unknown as { __convites?: { ip: Map<string, number[]>; todos: number[] } };
const LIMITE_IP = 3; // por hora
const LIMITE_TOTAL = 30; // por hora

function permitido(ip: string): boolean {
  const st: { ip: Map<string, number[]>; todos: number[] } = (g.__convites ??= { ip: new Map(), todos: [] });
  const hora = Date.now() - 3600_000;
  st.todos = st.todos.filter((t) => t > hora);
  const doIp = (st.ip.get(ip) ?? []).filter((t) => t > hora);
  if (doIp.length >= LIMITE_IP || st.todos.length >= LIMITE_TOTAL) return false;
  doIp.push(Date.now());
  st.ip.set(ip, doIp);
  st.todos.push(Date.now());
  return true;
}

function txt(fd: FormData, k: string, max: number) {
  return String(fd.get(k) ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

/** Pedido de convite feito na landing page: vai por e-mail para o responsável (CONVITE_EMAIL). */
export async function solicitarConvite(_: ConviteState, fd: FormData): Promise<ConviteState> {
  // armadilhas para robôs: campo invisível preenchido ou envio rápido demais
  if (String(fd.get("site") ?? "")) return { ok: true };
  const inicio = Number(fd.get("t") ?? 0);
  if (inicio && Date.now() - inicio < 2500) return { ok: true };

  const nome = txt(fd, "nome", 120);
  const email = normalizeEmail(txt(fd, "email", 254));
  const empresa = txt(fd, "empresa", 160);
  const cargo = txt(fd, "cargo", 120);
  const mensagem = String(fd.get("mensagem") ?? "").trim().slice(0, 1500);
  if (nome.length < 2) return { error: "Informe seu nome." };
  if (!isValidEmail(email)) return { error: "Informe um e-mail válido." };

  const h = await headers();
  const ip = (h.get("x-forwarded-for")?.split(",")[0] || h.get("x-real-ip") || "").trim().slice(0, 64);
  if (!permitido(ip || "sem-ip")) return { error: "Recebemos muitos pedidos agora. Tente de novo em alguns minutos." };

  try {
    await sendPedidoConvite(env.conviteEmail, { nome, email, empresa, cargo, mensagem, ip });
  } catch (e) {
    console.error("[convite] falha no envio:", e);
    return { error: "Não conseguimos enviar seu pedido agora. Tente de novo em instantes." };
  }
  await (await store()).audit({ actor: email, action: "convite.solicitado", target: `${nome}${empresa ? ` · ${empresa}` : ""}`, ip }).catch(() => undefined);
  return { ok: true };
}
