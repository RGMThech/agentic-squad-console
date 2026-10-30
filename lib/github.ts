import "server-only";
import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import { env } from "./env";

export type GH = Octokit;

const base = () => (env.githubApiUrl ? { baseUrl: env.githubApiUrl } : {});

type AppState = {
  installationId: number;
  slug: string;
  octokit: Octokit;
  at: number;
  permissions: Record<string, string>;
  repositorySelection: string;
};
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
  return {
    installationId: inst.data.id,
    slug: app.data?.slug ?? "squad-console",
    octokit,
    at: Date.now(),
    permissions: (inst.data.permissions ?? {}) as Record<string, string>,
    repositorySelection: inst.data.repository_selection ?? "",
  };
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

/** Permissões que o console precisa na instalação do App. */
export const REQUIRED_PERMISSIONS: Record<string, "read" | "write"> = {
  actions: "write",
  administration: "write",
  checks: "read",
  contents: "write",
  issues: "write",
  metadata: "read",
  pull_requests: "write",
  secrets: "write",
  workflows: "write",
};

const NOMES: Record<string, string> = {
  actions: "Actions",
  administration: "Administration",
  checks: "Checks",
  contents: "Contents",
  issues: "Issues",
  metadata: "Metadata",
  pull_requests: "Pull requests",
  secrets: "Secrets",
  workflows: "Workflows",
};

/** Permissões que faltam na instalação (comparando com o que a organização aprovou). */
export async function missingPermissions(): Promise<{ faltando: string[]; selecao: string }> {
  await gh();
  const st = (await g.__squadApp)!;
  const faltando = Object.entries(REQUIRED_PERMISSIONS)
    .filter(([k, need]) => {
      const have = st.permissions[k];
      return !(have === "write" || (need === "read" && have === "read"));
    })
    .map(([k, need]) => `${NOMES[k]}: ${need === "write" ? "Read and write" : "Read-only"}`);
  return { faltando, selecao: st.repositorySelection };
}

/** Recarrega os dados da instalação (após aprovar novas permissões no GitHub). */
export function resetAppCache() {
  g.__squadApp = undefined;
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

/** Detalhe técnico do erro do GitHub: status, mensagem e erros do corpo da resposta. */
export function errDetail(e: unknown): string {
  const x = (typeof e === "object" && e ? e : {}) as {
    status?: number;
    message?: string;
    name?: string;
    response?: { data?: { message?: string; errors?: unknown[]; documentation_url?: string } };
  };
  const data = x.response?.data;
  const errs = (data?.errors ?? [])
    .map((er) => (typeof er === "string" ? er : (er as { message?: string; code?: string })?.message ?? (er as { code?: string })?.code ?? ""))
    .filter(Boolean)
    .join("; ");
  const partes = [
    x.status ? `HTTP ${x.status}` : "",
    data?.message || x.message || "",
    errs,
  ].filter((s, i, a) => s && a.indexOf(s) === i);
  return partes.join(" — ") || x.name || String(e) || "erro sem mensagem";
}

/** Mensagem amigável para erros da API do GitHub. */
export function errMsg(e: unknown): string {
  const s = status(e);
  const raw = errDetail(e);
  if (s === 401) return "O GitHub App não conseguiu se autenticar. Confira GITHUB_APP_ID e GITHUB_APP_PRIVATE_KEY.";
  if (s === 403) {
    if (/Resource not accessible by integration/i.test(raw))
      return `O GitHub App não tem a permissão necessária para esta ação. Confira as permissões do App e aprove-as na instalação da organização. Detalhe: ${raw}`;
    return `O GitHub negou a operação (permissão do App insuficiente ou limite de requisições). Detalhe: ${raw}`;
  }
  if (s === 404) return `Recurso não encontrado no GitHub (ou o App não tem acesso a ele). Detalhe: ${raw}`;
  if (s === 409) return "Conflito: o arquivo mudou enquanto você editava. Recarregue a página e tente de novo.";
  if (s === 422) return `O GitHub recusou os dados enviados. Detalhe: ${raw}`;
  return raw;
}
