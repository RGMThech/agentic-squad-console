import "server-only";
import YAML from "yaml";
import type { Feature, SquadContext } from "./squad";
import { TIPO_PADRAO, type Pasta } from "./tipo.ts";

/** "documentos" (pasta da feature), uma chave por pasta de entrega do tipo, ou "outros". */
export type Categoria = string;

export type ArquivoEntrega = {
  path: string;
  nome: string;
  categoria: Categoria;
  camada?: string;
  status: "novo" | "alterado";
  /** Texto (markdown, SQL, YAML, Python…): pode ser exportado para DOCX e PDF. */
  texto: boolean;
  url: string;
};

export type ObjetoEntrega = {
  objeto: string;
  camada: string;
  local: string | null;
  /** Local deduzido do design (schema da camada), não declarado no contrato. */
  localInferido?: boolean;
  descricao: string;
  colunas: number;
  pii: number;
  contrato: string;
};

/** Chaves das pastas do tipo dados (mantidas para as squads antigas e o dossiê). */
const CHAVE_DADOS: Record<string, string> = { "contracts/": "contratos", "pipelines/": "pipelines", "models/": "pipelines", "tests/": "testes", "docs/": "docs", "semantic/": "semantica" };

function chaveDaPasta(prefixo: string): string {
  return CHAVE_DADOS[prefixo] ?? prefixo.replace(/\/$/, "");
}

/** Grupos da aba Entrega, na ordem: documentos da feature, pastas do tipo, outros. */
export function categoriasDaEntrega(pastas: Pasta[] = TIPO_PADRAO.pastas): { chave: Categoria; rotulo: string; prefixos: string[] }[] {
  const grupos: { chave: Categoria; rotulo: string; prefixos: string[] }[] = [{ chave: "documentos", rotulo: "Especificação, design e relatórios", prefixos: [] }];
  for (const p of pastas) {
    const chave = chaveDaPasta(p.prefixo);
    const g = grupos.find((x) => x.chave === chave);
    if (g) g.prefixos.push(p.prefixo);
    else grupos.push({ chave, rotulo: p.rotulo, prefixos: [p.prefixo] });
  }
  // dbt: models/ conta como pipeline quando o tipo tem pipelines/
  const pip = grupos.find((g) => g.chave === "pipelines");
  if (pip && !pip.prefixos.includes("models/")) pip.prefixos.push("models/");
  grupos.push({ chave: "outros", rotulo: "Outros arquivos", prefixos: [] });
  return grupos;
}

export const ROTULO_CATEGORIA: Record<string, string> = Object.fromEntries(categoriasDaEntrega().map((g) => [g.chave, g.rotulo]));

const ORDEM_DOCS = ["pedido.md", "spec.md", "design.md", "tasks.md", "qa-report.md", "review.md", "entrega.md"];
const RE_TEXTO = /\.(md|markdown|txt|sql|py|ya?ml|json|csv|toml|ini|cfg|sh|ipynb|r|scala|jinja2?|j2)$/i;

export function categoria(path: string, feature: string, pastas: Pasta[] = TIPO_PADRAO.pastas): { categoria: Categoria; camada?: string } {
  if (path.startsWith(`specs/${feature}/`)) return { categoria: "documentos" };
  const g = categoriasDaEntrega(pastas).find((x) => x.prefixos.some((p) => path.startsWith(p)));
  if (!g) return { categoria: "outros" };
  if (g.chave === "pipelines") {
    const camada = path.match(/(bronze|silver|gold)/i)?.[1]?.toLowerCase() ?? path.match(/\/(brz|slv|gld)_/)?.[1];
    return { categoria: g.chave, camada: camada === "brz" ? "bronze" : camada === "slv" ? "silver" : camada === "gld" ? "gold" : camada };
  }
  return { categoria: g.chave };
}

function ordem(a: ArquivoEntrega, b: ArquivoEntrega): number {
  const ia = ORDEM_DOCS.indexOf(a.nome);
  const ib = ORDEM_DOCS.indexOf(b.nome);
  if (a.categoria === "documentos" && b.categoria === "documentos" && (ia >= 0 || ib >= 0)) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  const ca = { bronze: 0, silver: 1, gold: 2 }[a.camada ?? ""] ?? 3;
  const cb = { bronze: 0, silver: 1, gold: 2 }[b.camada ?? ""] ?? 3;
  return ca - cb || a.path.localeCompare(b.path);
}

/** Ref onde ler os arquivos: a branch da feature ou, depois do G3, a branch principal. */
export function refDaFeature(ctx: SquadContext, f: Feature): string {
  return f.pr?.state === "merged" || !f.branch ? ctx.defaultBranch : f.branch;
}

/** Tudo o que a feature produziu: arquivos do PR (ou da pasta da spec) agrupados por tipo. */
export async function arquivosDaFeature(ctx: SquadContext, f: Feature): Promise<ArquivoEntrega[]> {
  const ref = refDaFeature(ctx, f);
  const web = (p: string) => `https://github.com/${ctx.owner}/${ctx.repo}/blob/${encodeURIComponent(ref)}/${p.split("/").map(encodeURIComponent).join("/")}`;
  let lista: { path: string; status: "novo" | "alterado" }[] = [];
  // todas as rodadas da feature (PR atual e entregas anteriores)
  for (const pr of [...f.prs].reverse()) {
    const files = await ctx.o.paginate(ctx.o.pulls.listFiles, { owner: ctx.owner, repo: ctx.repo, pull_number: pr.number, per_page: 100 });
    for (const x of files) {
      const i = lista.findIndex((l) => l.path === x.filename);
      if (x.status === "removed") {
        if (i >= 0) lista.splice(i, 1);
      } else if (i < 0) lista.push({ path: x.filename, status: x.status === "added" ? "novo" : "alterado" });
    }
  }
  // garante os documentos da pasta da feature (pedido.md pode ter vindo antes do PR)
  try {
    const r = await ctx.o.repos.getContent({ owner: ctx.owner, repo: ctx.repo, path: `specs/${f.id}`, ref });
    if (Array.isArray(r.data))
      for (const d of r.data) if (d.type === "file" && !lista.some((x) => x.path === d.path)) lista.push({ path: d.path, status: "novo" });
  } catch {
    /* pasta ainda não existe */
  }
  const pastas = ctx.tipo?.pastas ?? TIPO_PADRAO.pastas;
  const ordemGrupos = categoriasDaEntrega(pastas).map((g) => g.chave);
  return lista
    .map(({ path, status }) => {
      const c = categoria(path, f.id, pastas);
      return { path, nome: path.split("/").pop() ?? path, ...c, status, texto: RE_TEXTO.test(path), url: web(path) };
    })
    .sort((a, b) => ordemGrupos.indexOf(a.categoria) - ordemGrupos.indexOf(b.categoria) || ordem(a, b));
}

/** Lê um arquivo como bytes (inclui arquivos acima de 1 MB, via blob). */
export async function lerBytes(ctx: SquadContext, path: string, ref: string): Promise<Buffer | null> {
  try {
    const r = await ctx.o.repos.getContent({ owner: ctx.owner, repo: ctx.repo, path, ref });
    const d = r.data;
    if (Array.isArray(d) || d.type !== "file") return null;
    if ("content" in d && d.content) return Buffer.from(d.content, "base64");
    const blob = await ctx.o.git.getBlob({ owner: ctx.owner, repo: ctx.repo, file_sha: d.sha });
    return Buffer.from(blob.data.content, "base64");
  } catch (e) {
    if ((e as { status?: number }).status === 404) return null;
    throw e;
  }
}

/** Objetos construídos na plataforma, a partir dos contratos da entrega. */
export function objetosDosContratos(contratos: { path: string; texto: string }[]): ObjetoEntrega[] {
  const out: ObjetoEntrega[] = [];
  for (const c of contratos) {
    let d: Record<string, unknown> = {};
    try {
      d = (YAML.parse(c.texto) ?? {}) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (!d.tabela) continue;
    const cols = Array.isArray(d.colunas) ? (d.colunas as Record<string, unknown>[]) : [];
    out.push({
      objeto: String(d.tabela),
      camada: String(d.camada ?? ""),
      local: d.local ? String(d.local) : null,
      descricao: String(d.descricao ?? ""),
      colunas: cols.length,
      pii: cols.filter((x) => x?.pii === true).length,
      contrato: c.path,
    });
  }
  const ord = { bronze: 0, silver: 1, gold: 2 } as Record<string, number>;
  return out.sort((a, b) => (ord[a.camada] ?? 3) - (ord[b.camada] ?? 3) || a.objeto.localeCompare(b.objeto));
}

/**
 * Completa o local físico dos objetos a partir dos documentos da feature:
 * 1) banco.schema.objeto citado (entrega.md, design, tarefas);
 * 2) senão, o schema da camada citado no design (ex.: eleicoes2024.bronze) + o nome do objeto, marcado como inferido.
 */
export function completarLocais(objetos: ObjetoEntrega[], textos: string | null | undefined): ObjetoEntrega[] {
  if (!textos) return objetos;
  const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return objetos.map((o) => {
    if (o.local) return o;
    const exato = textos.match(new RegExp(`[\\w-]+\\.[\\w-]+\\.${esc(o.objeto)}\\b`));
    if (exato) return { ...o, local: exato[0] };
    if (!o.camada) return o;
    const contagem = new Map<string, number>();
    for (const m of textos.matchAll(new RegExp(`\\b([A-Za-z_][\\w-]*)\\.${esc(o.camada)}\\b`, "g"))) contagem.set(m[1], (contagem.get(m[1]) ?? 0) + 1);
    const banco = [...contagem.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    return banco ? { ...o, local: `${banco}.${o.camada}.${o.objeto}`, localInferido: true } : o;
  });
}
