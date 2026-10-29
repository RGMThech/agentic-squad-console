"use server";

import { revalidatePath } from "next/cache";
import { store, type GlobalRole } from "./db";
import { env } from "./env";
import { sendInvite } from "./mail";
import { isValidEmail, normalizeEmail } from "./otp";
import { requireAdmin, requireUser } from "./session";

export type AdminState = { ok?: boolean; error?: string; message?: string };

const ROLES: GlobalRole[] = ["admin", "usuario"];

/** Convida (cria) uma conta e manda o e-mail de convite. */
export async function inviteUser(_: AdminState, fd: FormData): Promise<AdminState> {
  const admin = await requireAdmin();
  const email = normalizeEmail(String(fd.get("email") ?? ""));
  const name = String(fd.get("name") ?? "").trim().slice(0, 120);
  const role = String(fd.get("role") ?? "usuario") as GlobalRole;
  if (!isValidEmail(email)) return { error: "Informe um e-mail válido." };
  if (!ROLES.includes(role)) return { error: "Papel inválido." };
  const db = await store();
  if (await db.findUserByEmail(email)) return { error: "Já existe uma conta com este e-mail." };
  await db.createUser({ email, name, role, invitedBy: admin.email });
  await db.audit({ actor: admin.email, action: "usuario.convidar", target: `${email} (${role})` });
  try {
    await sendInvite(email, name, admin.name);
  } catch (e) {
    revalidatePath("/admin/usuarios");
    return { ok: true, message: `Conta criada, mas o e-mail de convite falhou (${(e as Error).message}). Avise a pessoa para acessar ${env.appUrl}/login.` };
  }
  revalidatePath("/admin/usuarios");
  return { ok: true, message: `Convite enviado para ${email}.` };
}

export async function resendInvite(_: AdminState, fd: FormData): Promise<AdminState> {
  const admin = await requireAdmin();
  const db = await store();
  const u = await db.findUserById(Number(fd.get("id")));
  if (!u) return { error: "Conta não encontrada." };
  try {
    await sendInvite(u.email, u.name, admin.name);
  } catch (e) {
    return { error: `Falha ao enviar: ${(e as Error).message}` };
  }
  await db.audit({ actor: admin.email, action: "usuario.reenviar_convite", target: u.email });
  return { ok: true, message: `Convite reenviado para ${u.email}.` };
}

/** Atualiza nome, papel global ou status (desativar encerra as sessões na hora). */
export async function updateUser(_: AdminState, fd: FormData): Promise<AdminState> {
  const admin = await requireAdmin();
  const db = await store();
  const u = await db.findUserById(Number(fd.get("id")));
  if (!u) return { error: "Conta não encontrada." };
  const acao = String(fd.get("acao") ?? "");
  const protegido = env.adminEmails.includes(u.email);

  if (acao === "desativar" || acao === "reativar") {
    if (u.id === admin.id) return { error: "Você não pode desativar a própria conta." };
    if (protegido && acao === "desativar") return { error: "Esta conta está em ADMIN_EMAILS e não pode ser desativada pelo console." };
    await db.updateUser(u.id, { status: acao === "desativar" ? "desativado" : "ativo", bumpSession: true });
    await db.audit({ actor: admin.email, action: `usuario.${acao}`, target: u.email });
  } else if (acao === "papel") {
    const role = String(fd.get("role") ?? "") as GlobalRole;
    if (!ROLES.includes(role)) return { error: "Papel inválido." };
    if (protegido && role !== "admin") return { error: "Esta conta está em ADMIN_EMAILS e é sempre administradora." };
    if (u.id === admin.id && role !== "admin") return { error: "Você não pode remover o próprio papel de administrador." };
    await db.updateUser(u.id, { role, bumpSession: true });
    await db.audit({ actor: admin.email, action: "usuario.papel", target: `${u.email} → ${role}` });
  } else if (acao === "nome") {
    await db.updateUser(u.id, { name: String(fd.get("name") ?? "").trim().slice(0, 120) });
  } else if (acao === "encerrar_sessoes") {
    await db.updateUser(u.id, { bumpSession: true });
    await db.audit({ actor: admin.email, action: "usuario.encerrar_sessoes", target: u.email });
  } else {
    return { error: "Ação inválida." };
  }
  revalidatePath("/admin/usuarios");
  return { ok: true, message: "Conta atualizada." };
}

/** Qualquer usuário pode atualizar o próprio nome. */
export async function updateMyName(_: AdminState, fd: FormData): Promise<AdminState> {
  const me = await requireUser();
  const name = String(fd.get("name") ?? "").trim().slice(0, 120);
  if (name.length < 2) return { error: "Informe seu nome." };
  await (await store()).updateUser(me.id, { name });
  revalidatePath("/", "layout");
  return { ok: true, message: "Nome atualizado." };
}
