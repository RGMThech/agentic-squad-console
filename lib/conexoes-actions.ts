"use server";

import { revalidatePath } from "next/cache";
import { cifrar } from "./cofre";
import { store } from "./db";
import { env, pem } from "./env";
import { acharInstalacao, appDoConsole, appDoConsoleConfigurado, errMsg, invalidarConexoes, listarConexoes, permissoesFaltando, status } from "./github";
import { requireAdmin } from "./session";
import { Octokit } from "@octokit/rest";
import { createAppAuth } from "@octokit/auth-app";

export type ConexaoState = { ok?: boolean; error?: string; message?: string };

const RE_OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const RE_TEMPLATE = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;

function txt(fd: FormData, k: string, max = 300) {
  return String(fd.get(k) ?? "").trim().slice(0, max);
}

function normalizarOwner(v: string): string {
  // aceita "minha-org", "@minha-org" ou a URL https://github.com/minha-org
  return v.replace(/^https?:\/\/[^/]+\//i, "").replace(/^@/, "").split("/")[0].trim();
}

function validarTemplate(t: string): string | null {
  return RE_TEMPLATE.test(t) ? null : "Template deve estar no formato dono/repositorio (ex.: RGMThech/agentic-data-squad).";
}

function avisos(inst: { permissions?: Record<string, string> | object; repository_selection?: string }): string {
  const falt = permissoesFaltando((inst.permissions ?? {}) as Record<string, string>);
  const partes = [];
  if (falt.length) partes.push(`faltam permissões: ${falt.join(", ")}`);
  if (inst.repository_selection && inst.repository_selection !== "all") partes.push('escolha "All repositories" na instalação');
  return partes.length ? ` Atenção: ${partes.join("; ")}.` : "";
}

/** Conecta uma organização onde o App do Squad Console já foi instalado. */
export async function conectarAppConsole(_: ConexaoState, fd: FormData): Promise<ConexaoState> {
  const admin = await requireAdmin();
  try {
    const owner = normalizarOwner(txt(fd, "owner", 200));
    const template = txt(fd, "template", 200) || env.templateRepo;
    if (!RE_OWNER.test(owner)) return { error: "Informe o nome da organização como aparece no GitHub (ex.: minha-empresa)." };
    const t = validarTemplate(template);
    if (t) return { error: t };
    if (!appDoConsoleConfigurado()) return { error: "O App do console não está configurado (GITHUB_APP_ID e GITHUB_APP_PRIVATE_KEY). Use a opção App próprio." };
    const inst = await acharInstalacao(appDoConsole(), owner);
    if (!inst) return { error: `O App do Squad Console ainda não está instalado em ${owner}. Use o link "Instalar em outra organização" e tente de novo.` };
    const login = (inst.account as { login?: string } | null)?.login ?? owner;
    if ((inst.account as { type?: string } | null)?.type === "User")
      return { error: `${login} é uma conta pessoal. As squads precisam de uma organização do GitHub (crie uma gratuita e instale o App nela).` };
    const db = await store();
    await db.salvarConexao({ owner: login, modo: "app_console", installationId: inst.id, appId: null, chaveCifrada: null, template, ativo: true, criadoPor: admin.email });
    await db.audit({ actor: admin.email, action: "conexao.conectar", target: `${login} (App do console)` });
    invalidarConexoes(login);
    revalidatePath("/admin/conexoes");
    return { ok: true, message: `${login} conectada.${avisos(inst)}` };
  } catch (e) {
    return { error: errMsg(e) };
  }
}

/** Conecta uma organização com um GitHub App criado pelo próprio cliente (a chave fica cifrada no banco). */
export async function conectarAppProprio(_: ConexaoState, fd: FormData): Promise<ConexaoState> {
  const admin = await requireAdmin();
  try {
    const owner = normalizarOwner(txt(fd, "owner", 200));
    const appId = txt(fd, "appId", 20);
    const chave = pem(String(fd.get("chave") ?? "").trim());
    const template = txt(fd, "template", 200) || env.templateRepo;
    if (!RE_OWNER.test(owner)) return { error: "Informe o nome da organização como aparece no GitHub." };
    if (!/^\d{3,12}$/.test(appId)) return { error: "App ID é o número que aparece em Developer settings → GitHub Apps → seu App (About)." };
    if (!/-----BEGIN (RSA )?PRIVATE KEY-----/.test(chave)) return { error: "Cole a chave privada do App inteira (arquivo .pem), com as linhas BEGIN e END." };
    const t = validarTemplate(template);
    if (t) return { error: t };

    const asApp = new Octokit({ authStrategy: createAppAuth, auth: { appId, privateKey: chave }, userAgent: "squad-console", ...(env.githubApiUrl ? { baseUrl: env.githubApiUrl } : {}) });
    try {
      await asApp.apps.getAuthenticated();
    } catch (e) {
      if (status(e) === 401) return { error: "O GitHub recusou o App ID com essa chave. Confira se a chave é do mesmo App e não foi revogada." };
      throw e;
    }
    const inst = await acharInstalacao(asApp, owner);
    if (!inst) return { error: `Esse App não está instalado em ${owner}. Instale-o na organização (App → Install App) e tente de novo.` };
    const login = (inst.account as { login?: string } | null)?.login ?? owner;
    const db = await store();
    await db.salvarConexao({ owner: login, modo: "app_proprio", installationId: inst.id, appId, chaveCifrada: cifrar(chave), template, ativo: true, criadoPor: admin.email });
    await db.audit({ actor: admin.email, action: "conexao.conectar", target: `${login} (App próprio ${appId})` });
    invalidarConexoes(login);
    revalidatePath("/admin/conexoes");
    return { ok: true, message: `${login} conectada com o App próprio.${avisos(inst)}` };
  } catch (e) {
    return { error: errMsg(e) };
  }
}

/** Muda o template ou ativa/desativa uma conexão. */
export async function atualizarConexao(_: ConexaoState, fd: FormData): Promise<ConexaoState> {
  const admin = await requireAdmin();
  try {
    const owner = txt(fd, "owner", 100);
    const c = (await listarConexoes()).find((x) => x.owner === owner);
    if (!c) return { error: "Conexão não encontrada." };
    const intent = txt(fd, "intent", 20);
    const db = await store();
    if (intent === "desconectar") {
      await db.removerConexao(owner);
      await db.audit({ actor: admin.email, action: "conexao.desconectar", target: owner });
      invalidarConexoes(owner);
      revalidatePath("/admin/conexoes");
      return { ok: true, message: `${owner} desconectada. Os repositórios continuam no GitHub; as squads só deixam de aparecer no console.` };
    }
    const template = intent === "template" ? txt(fd, "template", 200) : c.template;
    const tErr = validarTemplate(template);
    if (tErr) return { error: tErr };
    const ativo = intent === "ativar" ? true : intent === "pausar" ? false : c.ativo;
    await db.salvarConexao({ ...c, template, ativo });
    await db.audit({ actor: admin.email, action: "conexao.alterar", target: `${owner}: ${intent}` });
    invalidarConexoes(owner);
    revalidatePath("/admin/conexoes");
    return { ok: true, message: intent === "template" ? `Template de ${owner}: ${template}.` : ativo ? `${owner} ativada.` : `${owner} pausada: as squads dela ficam ocultas no console.` };
  } catch (e) {
    return { error: errMsg(e) };
  }
}
