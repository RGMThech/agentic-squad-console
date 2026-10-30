import "server-only";
import { dbtPedido, lerDados, type DadosConfig } from "./dados-meta";
import YAML from "yaml";
import { env } from "./env";
import { gh, listDir, readFile, status, type GH } from "./github";
import {
  computeGates,
  openDoubts,
  parseFrontmatter,
  parseMembers,
  parseRunRecords,
  resumoExecucao,
  parseDoubts,
  situacao,
  type Situacao,
  parseRunTitle,
  parseTasks,
  resolveRole,
  type Frontmatter,
  type GateState,
  type Members,
  type Role,
  type RunRecord,
  type Task,
} from "./core";
import type { User } from "./session";

export type SquadSummary = {
  owner: string;
  repo: string;
  private: boolean;
  description: string | null;
  updatedAt: string | null;
  defaultBranch: string;
};

export type SquadConfig = {
  nome: string;
  cliente: string;
  descricao: string;
  plataforma: string;
  modelo: string;
  max_turnos: number;
  alerta_custo_usd: number;
  console_bot: string;
  dados: DadosConfig | null;
  dbt: boolean;
};

export type SquadContext = {
  owner: string;
  repo: string;
  defaultBranch: string;
  private: boolean;
  htmlUrl: string;
  config: SquadConfig;
  members: Members;
  role: Role;
  user: User;
  o: GH;
};

export type Doc = { path: string; sha: string; data: Frontmatter; body: string; raw: string };

export type PR = {
  number: number;
  nodeId: string;
  title: string;
  state: "open" | "closed" | "merged";
  draft: boolean;
  url: string;
  headRef: string;
  headSha: string;
  author: string;
  updatedAt: string;
};

export type Feature = {
  id: string;
  numero: string;
  titulo: string;
  branch: string | null;
  ref: string;
  spec: Doc | null;
  design: Doc | null;
  tasksDoc: Doc | null;
  tasks: Task[];
  qa: Doc | null;
  review: Doc | null;
  doubts: string[];
  pr: PR | null;
  gates: { g1: GateState; g2: GateState; g3: GateState };
};

export type Run = {
  id: string;
  url: string;
  status: string; // queued | in_progress | completed
  conclusion: string | null;
  agente: string;
  feature: string;
  ator: string;
  createdAt: string;
  updatedAt: string;
  record: RunRecord | null;
  /** O que o agente disse ao terminar (comentário da execução no PR). */
  resumo: string;
};

// ---------------- squads ----------------

export async function listSquads(user: User): Promise<SquadSummary[]> {
  const o = await gh();
  const repos = await o.paginate(o.apps.listReposAccessibleToInstallation, { per_page: 100 });
  const squads = repos
    .filter((r) => (r.topics ?? []).map((t) => t.toLowerCase()).includes(env.topic))
    .map((r) => ({
      owner: r.owner.login,
      repo: r.name,
      private: r.private,
      description: r.description,
      updatedAt: r.updated_at ?? null,
      defaultBranch: r.default_branch,
    }))
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  if (user.isAdmin) return squads;
  // usuário comum: só as squads em que o e-mail dele aparece em .squad/members.yaml
  const visiveis = await Promise.all(
    squads.map(async (s) => {
      const mem = await readFile(o, s.owner, s.repo, ".squad/members.yaml", s.defaultBranch).catch(() => null);
      return resolveRole(user.email, parseMembers(mem?.content ?? null), false) ? s : null;
    }),
  );
  return visiveis.filter((s): s is SquadSummary => s !== null);
}

const DEFAULT_CONFIG: SquadConfig = {
  nome: "",
  cliente: "",
  descricao: "",
  plataforma: "agnostico",
  modelo: "sonnet",
  max_turnos: 60,
  alerta_custo_usd: 5,
  console_bot: "",
  dados: null,
  dbt: false,
};

export function parseConfig(text: string | null, fallbackName: string): SquadConfig {
  let d: Record<string, unknown> = {};
  try {
    d = (text ? YAML.parse(text) : {}) ?? {};
  } catch {
    d = {};
  }
  return {
    ...DEFAULT_CONFIG,
    nome: String(d.nome ?? fallbackName),
    cliente: String(d.cliente ?? ""),
    descricao: String(d.descricao ?? ""),
    plataforma: String(d.plataforma ?? DEFAULT_CONFIG.plataforma),
    modelo: String(d.modelo ?? DEFAULT_CONFIG.modelo),
    max_turnos: Number(d.max_turnos ?? DEFAULT_CONFIG.max_turnos),
    alerta_custo_usd: Number(d.alerta_custo_usd ?? DEFAULT_CONFIG.alerta_custo_usd),
    console_bot: String(d.console_bot ?? ""),
    dados: lerDados(d),
    dbt: dbtPedido(d),
  };
}

/** Carrega a squad e resolve o papel do usuário. Retorna null se não houver acesso. */
export async function loadSquad(user: User, owner: string, repo: string): Promise<SquadContext | null> {
  const o = await gh();
  let repoData;
  try {
    repoData = (await o.repos.get({ owner, repo })).data;
  } catch (e) {
    if (status(e) === 404) return null;
    throw e;
  }
  const branch = repoData.default_branch;
  const [cfg, mem] = await Promise.all([
    readFile(o, owner, repo, ".squad/squad.yaml", branch),
    readFile(o, owner, repo, ".squad/members.yaml", branch),
  ]);
  const members = parseMembers(mem?.content ?? null);
  const role = resolveRole(user.email, members, user.isAdmin);
  if (!role) return null;
  return {
    owner,
    repo,
    defaultBranch: branch,
    private: repoData.private,
    htmlUrl: repoData.html_url,
    config: parseConfig(cfg?.content ?? null, repo),
    members,
    role,
    user,
    o,
  };
}

// ---------------- features ----------------

async function readDoc(ctx: SquadContext, path: string, ref: string): Promise<Doc | null> {
  const f = await readFile(ctx.o, ctx.owner, ctx.repo, path, ref);
  if (!f) return null;
  const { data, body } = parseFrontmatter(f.content);
  return { path: f.path, sha: f.sha, data, body, raw: f.content };
}

export async function listSquadPRs(ctx: SquadContext, prefix = "squad/"): Promise<PR[]> {
  const prs = await ctx.o.paginate(ctx.o.pulls.list, { owner: ctx.owner, repo: ctx.repo, state: "all", per_page: 100 });
  return prs
    .filter((p) => p.head.ref.startsWith(prefix))
    .map((p) => ({
      number: p.number,
      nodeId: p.node_id,
      title: p.title,
      state: p.merged_at ? "merged" : (p.state as "open" | "closed"),
      draft: Boolean(p.draft),
      url: p.html_url,
      headRef: p.head.ref,
      headSha: p.head.sha,
      author: p.user?.login ?? "",
      updatedAt: p.updated_at,
    }));
}

async function featureBranches(ctx: SquadContext): Promise<string[]> {
  try {
    const r = await ctx.o.git.listMatchingRefs({ owner: ctx.owner, repo: ctx.repo, ref: "heads/squad/" });
    return r.data.map((x) => x.ref.replace("refs/heads/squad/", ""));
  } catch (e) {
    if (status(e) === 404 || status(e) === 409) return [];
    throw e;
  }
}

export async function listFeatureIds(ctx: SquadContext): Promise<{ id: string; branch: boolean }[]> {
  const [branches, onMain] = await Promise.all([
    featureBranches(ctx),
    listDir(ctx.o, ctx.owner, ctx.repo, "specs", ctx.defaultBranch),
  ]);
  const ids = new Map<string, boolean>();
  for (const d of onMain) if (d.type === "dir") ids.set(d.name, false);
  for (const b of branches) ids.set(b, true);
  return [...ids.entries()].map(([id, branch]) => ({ id, branch })).sort((a, b) => b.id.localeCompare(a.id));
}

export async function loadFeature(ctx: SquadContext, id: string, hasBranch: boolean, prs: PR[]): Promise<Feature> {
  const branch = hasBranch ? `squad/${id}` : null;
  const ref = branch ?? ctx.defaultBranch;
  const base = `specs/${id}`;
  const [spec, design, tasksDoc, qa, review] = await Promise.all(
    ["spec.md", "design.md", "tasks.md", "qa-report.md", "review.md"].map((f) => readDoc(ctx, `${base}/${f}`, ref)),
  );
  const pr = (branch && prs.filter((p) => p.headRef === branch).sort((a, b) => b.number - a.number)[0]) || null;
  const gates = computeGates({
    specStatus: spec?.data.status,
    designStatus: design?.data.status,
    qaVeredito: qa?.data.veredito,
    hasReview: Boolean(review),
    prState: pr?.state,
    onMainOnly: !branch,
  });
  return {
    id,
    numero: id.slice(0, 3),
    titulo: spec?.data.titulo || id.slice(4).replace(/-/g, " "),
    branch,
    ref,
    spec,
    design,
    tasksDoc,
    tasks: tasksDoc ? parseTasks(tasksDoc.body) : [],
    qa,
    review,
    doubts: spec ? openDoubts(spec.body) : [],
    pr,
    gates,
  };
}

export async function listFeatures(ctx: SquadContext, prs?: PR[]): Promise<Feature[]> {
  const [ids, allPrs] = await Promise.all([listFeatureIds(ctx), prs ? Promise.resolve(prs) : listSquadPRs(ctx)]);
  return Promise.all(ids.map((f) => loadFeature(ctx, f.id, f.branch, allPrs)));
}

// ---------------- execuções ----------------

export async function listRuns(ctx: SquadContext, prs: PR[], limit = 60): Promise<Run[]> {
  let runs: Awaited<ReturnType<GH["actions"]["listWorkflowRuns"]>>["data"]["workflow_runs"] = [];
  try {
    runs = (
      await ctx.o.actions.listWorkflowRuns({ owner: ctx.owner, repo: ctx.repo, workflow_id: "squad-agent.yml", per_page: limit })
    ).data.workflow_runs;
  } catch (e) {
    if (status(e) !== 404) throw e;
  }

  const records = new Map<string, RunRecord>();
  const resumos = new Map<string, string>();
  const recent = prs.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 25);
  await Promise.all(
    recent.map(async (pr) => {
      const comments = await ctx.o.paginate(ctx.o.issues.listComments, {
        owner: ctx.owner,
        repo: ctx.repo,
        issue_number: pr.number,
        per_page: 100,
      });
      for (const c of comments) {
        const regs = parseRunRecords(c.body ?? "");
        for (const r of regs) records.set(r.run_id, r);
        if (regs.length === 1) resumos.set(regs[0].run_id, resumoExecucao(c.body ?? ""));
      }
    }),
  );

  return runs.map((r) => {
    const t = parseRunTitle(r.display_title ?? r.name ?? "") ?? { agente: "?", feature: "?", ator: r.actor?.login ?? "?" };
    return {
      id: String(r.id),
      url: r.html_url,
      status: r.status ?? "unknown",
      conclusion: r.conclusion ?? null,
      agente: t.agente,
      feature: t.feature,
      ator: t.ator,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      record: records.get(String(r.id)) ?? null,
      resumo: resumos.get(String(r.id)) ?? "",
    };
  });
}

export function isRunning(r: Run) {
  return r.status === "queued" || r.status === "in_progress" || r.status === "waiting" || r.status === "pending";
}

export async function prChecks(ctx: SquadContext, sha: string) {
  const r = await ctx.o.checks.listForRef({ owner: ctx.owner, repo: ctx.repo, ref: sha, per_page: 100 });
  const runs = r.data.check_runs;
  const pending = runs.filter((c) => c.status !== "completed").length;
  const failed = runs.filter((c) => c.status === "completed" && !["success", "neutral", "skipped"].includes(c.conclusion ?? "")).length;
  return {
    total: runs.length,
    pending,
    failed,
    state: (runs.length === 0 ? "none" : failed ? "failure" : pending ? "pending" : "success") as "none" | "failure" | "pending" | "success",
    items: runs.map((c) => ({ name: c.name, status: c.status, conclusion: c.conclusion, url: c.html_url })),
  };
}

export async function secretStatus(ctx: SquadContext, name: string): Promise<{ set: boolean; updatedAt: string | null }> {
  try {
    const r = await ctx.o.actions.getRepoSecret({ owner: ctx.owner, repo: ctx.repo, secret_name: name });
    return { set: true, updatedAt: r.data.updated_at };
  } catch (e) {
    if (status(e) === 404 || status(e) === 403) return { set: false, updatedAt: null };
    throw e;
  }
}

export async function apiKeyStatus(ctx: SquadContext): Promise<{ set: boolean; updatedAt: string | null }> {
  try {
    const r = await ctx.o.actions.getRepoSecret({ owner: ctx.owner, repo: ctx.repo, secret_name: "ANTHROPIC_API_KEY" });
    return { set: true, updatedAt: r.data.updated_at };
  } catch (e) {
    if (status(e) === 404 || status(e) === 403) return { set: false, updatedAt: null };
    throw e;
  }
}

/** Estado da feature para a tela: em execução, precisa de você, falhou ou entregue. */
export function situacaoDaFeature(f: Feature, runs: Run[]): Situacao {
  const daFeature = runs.filter((r) => r.feature === f.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const ativa = daFeature.find(isRunning);
  const ultima = daFeature.find((r) => !isRunning(r));
  const duvidas = f.spec ? parseDoubts(f.spec.body).abertas : [];
  return situacao({
    feature: f.id,
    gates: f.gates,
    duvidasTotal: duvidas.length,
    duvidasSemResposta: duvidas.filter((d) => !d.resposta).length,
    rodando: ativa ? { agente: ativa.agente, desde: ativa.createdAt, fila: ativa.status === "queued" } : null,
    ultima: ultima ? { agente: ultima.agente, ok: ultima.conclusion === "success" && ultima.record?.status !== "falha", resumo: ultima.resumo } : null,
    tarefas: f.tasks,
  });
}

/** Última execução concluída da feature (para mostrar a mensagem do agente). */
export function ultimaExecucao(f: { id: string }, runs: Run[]): Run | null {
  return runs.filter((r) => r.feature === f.id && !isRunning(r)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
}
