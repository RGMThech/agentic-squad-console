import "server-only";
import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import { decifrar } from "./cofre";
import { store, type ConexaoRow } from "./db";
import { env, pem } from "./env";

export type GH = Octokit;

const base = () => (env.githubApiUrl ? { baseUrl: env.githubApiUrl } : {});

type Inst = {
  owner: string;
  installationId: number;
  slug: string;
  octokit: Octokit;
  permissions: Record<string, string>;
  repositorySelection: string;
  conexao: ConexaoRow;
};
const g = globalThis as unknown as {
  __squadInst?: Map<string, Promise<Inst>>;
  __squadConexoes?: { at: number; lista: Promise<ConexaoRow[]> };
};
const insts = () => (g.__squadInst ??= new Map());

/** Erro de squad/organização que não está conectada ao console (tratado como "não encontrado"). */
export class SemConexao extends Error {
  status = 404;
}

// ---------------------------------------------------------------- conexões

/** Organizações conectadas. Na primeira vez, conecta a GITHUB_ORG (compatibilidade com a instalação antiga). */
export async function listarConexoes(): Promise<ConexaoRow[]> {
  const c = g.__squadConexoes;
  if (c && Date.now() - c.at < 30_000) return c.lista;
  const lista = (async () => {
    const db = await store();
    let rows = await db.listConexoes();
    if (!rows.length && env.githubOrg && env.githubAppId) {
      await db.salvarConexao({
        owner: env.githubOrg, modo: "app_console", installationId: null, appId: null, chaveCifrada: null,
        template: env.templateRepo, ativo: true, criadoPor: "sistema (GITHUB_ORG)",
      });
      rows = await db.listConexoes();
    }
    return rows;
  })();
  g.__squadConexoes = { at: Date.now(), lista };
  lista.catch(() => (g.__squadConexoes = undefined));
  return lista;
}

export function invalidarConexoes(owner?: string) {
  g.__squadConexoes = undefined;
  if (owner) insts().delete(owner.toLowerCase());
  else insts().clear();
}

export async function conexaoDe(owner: string): Promise<ConexaoRow | null> {
  return (await listarConexoes()).find((c) => c.ativo && c.owner.toLowerCase() === owner.toLowerCase()) ?? null;
}

// ---------------------------------------------------------------- Apps

/** O GitHub App do próprio console (variáveis GITHUB_APP_ID e GITHUB_APP_PRIVATE_KEY). */
export function appDoConsoleConfigurado(): boolean {
  return Boolean(process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY);
}

function comoApp(appId: string, privateKey: string): Octokit {
  return new Octokit({ authStrategy: createAppAuth, auth: { appId, privateKey }, userAgent: "squad-console", ...base() });
}

export function appDoConsole(): Octokit {
  return comoApp(env.githubAppId, env.githubAppPrivateKey);
}

function credenciais(c: ConexaoRow): { appId: string; privateKey: string } {
  if (c.modo === "app_proprio") {
    if (!c.appId || !c.chaveCifrada) throw new Error(`A conexão ${c.owner} usa um App próprio, mas o App ID ou a chave não estão cadastrados.`);
    return { appId: c.appId, privateKey: pem(decifrar(c.chaveCifrada)) };
  }
  return { appId: env.githubAppId, privateKey: env.githubAppPrivateKey };
}

/** Acha a instalação do App numa organização (ou conta pessoal). */
export async function acharInstalacao(asApp: Octokit, owner: string) {
  try {
    return (await asApp.apps.getOrgInstallation({ org: owner })).data;
  } catch (e) {
    if (status(e) !== 404) throw e;
  }
  try {
    return (await asApp.apps.getUserInstallation({ username: owner })).data;
  } catch (e) {
    if (status(e) === 404) return null;
    throw e;
  }
}

async function init(c: ConexaoRow): Promise<Inst> {
  const { appId, privateKey } = credenciais(c);
  const asApp = comoApp(appId, privateKey);
  const [app, inst] = await Promise.all([
    asApp.apps.getAuthenticated(),
    c.installationId
      ? asApp.apps.getInstallation({ installation_id: c.installationId }).then((r) => r.data).catch((e) => (status(e) === 404 ? acharInstalacao(asApp, c.owner) : Promise.reject(e)))
      : acharInstalacao(asApp, c.owner),
  ]);
  if (!inst) throw new Error(`O GitHub App não está instalado em ${c.owner}. Instale-o (Admin → Conexões mostra o link) e tente de novo.`);
  const octokit = new Octokit({ authStrategy: createAppAuth, auth: { appId, privateKey, installationId: inst.id }, userAgent: "squad-console", ...base() });
  return {
    owner: c.owner,
    installationId: inst.id,
    slug: app.data?.slug ?? "squad-console",
    octokit,
    permissions: (inst.permissions ?? {}) as Record<string, string>,
    repositorySelection: inst.repository_selection ?? "",
    conexao: c,
  };
}

async function instalacao(owner: string): Promise<Inst> {
  const c = await conexaoDe(owner);
  if (!c) throw new SemConexao(`A organização ${owner} não está conectada ao console. Um administrador conecta em Admin → Conexões.`);
  const k = c.owner.toLowerCase();
  let p = insts().get(k);
  if (!p) {
    p = init(c);
    insts().set(k, p);
    p.catch(() => insts().delete(k));
  }
  return p;
}

/** Cliente da API do GitHub autenticado como a instalação do App na organização da squad (token renovado sozinho). */
export async function gh(owner: string): Promise<GH> {
  return (await instalacao(owner)).octokit;
}

/** Login do bot do App na organização, como aparece em github.actor nos workflows. */
export async function appBotLogin(owner: string): Promise<string> {
  return `${(await instalacao(owner)).slug}[bot]`;
}

/** Template usado para criar squads nesta organização. */
export async function templateDe(owner: string): Promise<string> {
  return (await conexaoDe(owner))?.template || env.templateRepo;
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

export function permissoesFaltando(permissions: Record<string, string>): string[] {
  return Object.entries(REQUIRED_PERMISSIONS)
    .filter(([k, need]) => {
      const have = permissions[k];
      return !(have === "write" || (need === "read" && have === "read"));
    })
    .map(([k, need]) => `${NOMES[k]}: ${need === "write" ? "Read and write" : "Read-only"}`);
}

/** Permissões que faltam na instalação (comparando com o que a organização aprovou). */
export async function missingPermissions(owner: string): Promise<{ faltando: string[]; selecao: string; slug: string }> {
  const st = await instalacao(owner);
  return { faltando: permissoesFaltando(st.permissions), selecao: st.repositorySelection, slug: st.slug };
}

/** Recarrega os dados da instalação (após aprovar novas permissões no GitHub). */
export function resetAppCache(owner?: string) {
  if (owner) insts().delete(owner.toLowerCase());
  else insts().clear();
}

/** Onde o App do console é instalado em outra organização. */
export async function linkInstalacao(): Promise<{ slug: string; url: string } | null> {
  if (!appDoConsoleConfigurado()) return null;
  const app = (await appDoConsole().apps.getAuthenticated()).data;
  const web = env.githubApiUrl ? env.githubApiUrl.replace(/\/api\/v3$/, "") : "https://github.com";
  return { slug: app?.slug ?? "", url: `${web}/apps/${app?.slug}/installations/new` };
}

/** Instalações do App do console (organizações que já instalaram), conectadas ou não. */
export async function instalacoesDoConsole() {
  if (!appDoConsoleConfigurado()) return [];
  const lista = await appDoConsole().paginate(appDoConsole().apps.listInstallations, { per_page: 100 });
  return lista.map((i) => ({
    id: i.id,
    login: (i.account as { login?: string } | null)?.login ?? "?",
    tipo: (i.account as { type?: string } | null)?.type ?? "",
    faltando: permissoesFaltando((i.permissions ?? {}) as Record<string, string>),
    selecao: i.repository_selection ?? "",
  }));
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
