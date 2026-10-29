import "server-only";
import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import { env } from "./env";

export type GH = Octokit;

const base = () => (env.githubApiUrl ? { baseUrl: env.githubApiUrl } : {});

type AppState = { installationId: number; slug: string; octokit: Octokit; at: number };
const g = globalThis as unknown as { __squadApp?: Promise<AppState> };

async function init(): Promise<AppState> {
  const appId = env.githubAppId;
  const privateKey = env.githubAppPrivateKey;
  // autenticado como o próprio App (JWT): descobre a instalação na organização
  const asApp = new Octokit({ authStrategy: createAppAuth, auth: { appId, privateKey }, userAgent: "squad-console", ...base() });
  const [app, inst] = await Promise.all([
    asApp.apps.getAuthenticated(),
    asApp.apps.getOrgInstallation({ org: env.githubOrg }).catch((e) => {
      if (status(e) === 404)
        throw new Error(`O GitHub App não está instalado na organização ${env.githubOrg}. Instale-o em Settings → GitHub Apps.`);
      throw e;
    }),
  ]);
  const octokit = new Octokit({
    authStrategy: createAppAuth,
    auth: { appId, privateKey, installationId: inst.data.id },
    userAgent: "squad-console",
    ...base(),
  });
  return { installationId: inst.data.id, slug: app.data?.slug ?? "squad-console", octokit, at: Date.now() };
}

/** Cliente da API do GitHub autenticado como a instalação do App na organização (token renovado sozinho). */
export async function gh(): Promise<GH> {
  if (!g.__squadApp) {
    g.__squadApp = init().catch((e) => {
      g.__squadApp = undefined;
      throw e;
    });
  }
  return (await g.__squadApp).octokit;
}

/** Login do bot do App, como aparece em github.actor nos workflows. */
export async function appBotLogin(): Promise<string> {
  await gh();
  return `${(await g.__squadApp!).slug}[bot]`;
}

export type FileContent = { content: string; sha: string; path: string };

export async function readFile(o: GH, owner: string, repo: string, path: string, ref?: string): Promise<FileContent | null> {
  try {
    const r = await o.repos.getContent({ owner, repo, path, ...(ref ? { ref } : {}) });
    const d = r.data;
    if (Array.isArray(d) || d.type !== "file" || !("content" in d)) return null;
    return { content: Buffer.from(d.content, "base64").toString("utf8"), sha: d.sha, path: d.path };
  } catch (e) {
    if (status(e) === 404) return null;
    throw e;
  }
}

export async function listDir(o: GH, owner: string, repo: string, path: string, ref?: string) {
  try {
    const r = await o.repos.getContent({ owner, repo, path, ...(ref ? { ref } : {}) });
    return Array.isArray(r.data) ? r.data.map((x) => ({ name: x.name, path: x.path, type: x.type })) : [];
  } catch (e) {
    if (status(e) === 404) return [];
    throw e;
  }
}

export async function writeFile(
  o: GH,
  p: { owner: string; repo: string; path: string; content: string; message: string; branch: string; sha?: string },
) {
  return o.repos.createOrUpdateFileContents({
    owner: p.owner,
    repo: p.repo,
    path: p.path,
    branch: p.branch,
    message: p.message,
    content: Buffer.from(p.content, "utf8").toString("base64"),
    ...(p.sha ? { sha: p.sha } : {}),
  });
}

export function status(e: unknown): number | undefined {
  return typeof e === "object" && e && "status" in e ? Number((e as { status: unknown }).status) : undefined;
}

/** Mensagem amigável para erros da API do GitHub. */
export function errMsg(e: unknown): string {
  const s = status(e);
  const raw = e instanceof Error ? e.message : String(e);
  if (s === 401) return "O GitHub App não conseguiu se autenticar. Confira GITHUB_APP_ID e GITHUB_APP_PRIVATE_KEY.";
  if (s === 403) return `O GitHub negou a operação (permissão do App insuficiente ou limite de requisições). Detalhe: ${raw}`;
  if (s === 404) return "Recurso não encontrado no GitHub (ou o App não tem acesso a ele).";
  if (s === 409) return "Conflito: o arquivo mudou enquanto você editava. Recarregue a página e tente de novo.";
  if (s === 422) return `O GitHub recusou os dados enviados. Detalhe: ${raw}`;
  return raw;
}
