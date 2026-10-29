import "server-only";
import { Octokit } from "@octokit/rest";

export type GH = Octokit;

export function gh(token: string): GH {
  return new Octokit({
    auth: token,
    userAgent: "agentic-squad-console",
    // GitHub Enterprise Server: defina GITHUB_API_URL (ex.: https://github.empresa.com/api/v3)
    ...(process.env.GITHUB_API_URL ? { baseUrl: process.env.GITHUB_API_URL.replace(/\/$/, "") } : {}),
  });
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
  if (s === 401) return "Sua sessão do GitHub expirou. Saia e entre novamente.";
  if (s === 403) return `O GitHub negou a operação (permissão insuficiente ou limite de requisições). Detalhe: ${raw}`;
  if (s === 404) return "Recurso não encontrado no GitHub (ou você não tem acesso a ele).";
  if (s === 409) return "Conflito: o arquivo mudou enquanto você editava. Recarregue a página e tente de novo.";
  if (s === 422) return `O GitHub recusou os dados enviados. Detalhe: ${raw}`;
  return raw;
}
