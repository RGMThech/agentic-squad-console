import "server-only";
import YAML from "yaml";
import type { Feature, SquadContext } from "./squad";

export type Categoria = "documentos" | "contratos" | "pipelines" | "testes" | "docs" | "outros";

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
  descricao: string;
  colunas: number;
  pii: number;
  contrato: string;
};

export const ROTULO_CATEGORIA: Record<Categoria, string> = {
  documentos: "Especificação, design e relatórios",
  contratos: "Contratos de dados",
  pipelines: "Pipelines",
  testes: "Testes",
  docs: "Documentação e ADRs",
  outros: "Outros arquivos",
};

const ORDEM_DOCS = ["pedido.md", "spec.md", "design.md", "tasks.md", "qa-report.md", "review.md", "entrega.md"];
const RE_TEXTO = /\.(md|markdown|txt|sql|py|ya?ml|json|csv|toml|ini|cfg|sh|ipynb|r|scala|jinja2?|j2)$/i;

export function categoria(path: string, feature: string): { categoria: Categoria; camada?: string } {
  if (path.startsWith(`specs/${feature}/`)) return { categoria: "documentos" };
  if (path.startsWith("contracts/")) return { categoria: "contratos" };
  if (path.startsWith("pipelines/") || path.startsWith("models/")) {
    const camada = path.match(/(bronze|silver|gold)/i)?.[1]?.toLowerCase() ?? path.match(/\/(brz|slv|gld)_/)?.[1];
    return { categoria: "pipelines", camada: camada === "brz" ? "bronze" : camada === "slv" ? "silver" : camada === "gld" ? "gold" : camada };
  }
  if (path.startsWith("tests/")) return { categoria: "testes" };
  if (path.startsWith("docs/")) return { categoria: "docs" };
  return { categoria: "outros" };
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
  if (f.pr) {
    const files = await ctx.o.paginate(ctx.o.pulls.listFiles, { owner: ctx.owner, repo: ctx.repo, pull_number: f.pr.number, per_page: 100 });
    lista = files.filter((x) => x.status !== "removed").map((x) => ({ path: x.filename, status: x.status === "added" ? "novo" : "alterado" }));
  }
  // garante os documentos da pasta da feature (pedido.md pode ter vindo antes do PR)
  try {
    const r = await ctx.o.repos.getContent({ owner: ctx.owner, repo: ctx.repo, path: `specs/${f.id}`, ref });
    if (Array.isArray(r.data))
      for (const d of r.data) if (d.type === "file" && !lista.some((x) => x.path === d.path)) lista.push({ path: d.path, status: "novo" });
  } catch {
    /* pasta ainda não existe */
  }
  return lista
    .map(({ path, status }) => {
      const c = categoria(path, f.id);
      return { path, nome: path.split("/").pop() ?? path, ...c, status, texto: RE_TEXTO.test(path), url: web(path) };
    })
    .sort((a, b) => Object.keys(ROTULO_CATEGORIA).indexOf(a.categoria) - Object.keys(ROTULO_CATEGORIA).indexOf(b.categoria) || ordem(a, b));
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

/** Completa o local físico dos objetos com o relatório de entrega (banco.schema.objeto citado nele). */
export function completarLocais(objetos: ObjetoEntrega[], entrega: string | null | undefined): ObjetoEntrega[] {
  if (!entrega) return objetos;
  return objetos.map((o) => {
    if (o.local) return o;
    const m = entrega.match(new RegExp(`[\\w-]+\\.[\\w-]+\\.${o.objeto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`));
    return m ? { ...o, local: m[0] } : o;
  });
}
