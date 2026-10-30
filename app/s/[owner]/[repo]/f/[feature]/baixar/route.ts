import JSZip from "jszip";
import { NextResponse, type NextRequest } from "next/server";
import { RE_FEATURE, RE_NAME } from "@/lib/core";
import { arquivosDaFeature, completarLocais, lerBytes, objetosDosContratos, refDaFeature, type ArquivoEntrega } from "@/lib/entrega";
import { dossieDocx, dossiePdf, exportar, paraTxt, tituloDoc, type Contexto, type DocFonte, type Formato } from "@/lib/exportar";
import { currentUser } from "@/lib/session";
import { listFeatureIds, listSquadPRs, loadFeature, loadSquad } from "@/lib/squad";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const FORMATOS: (Formato | "original")[] = ["md", "txt", "docx", "pdf", "original"];

function arquivo(corpo: Buffer, tipo: string, nome: string) {
  const ascii = nome.replace(/[^\w.-]+/g, "_");
  return new NextResponse(new Uint8Array(corpo), {
    headers: {
      "Content-Type": tipo,
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nome)}`,
      "Cache-Control": "private, no-store",
    },
  });
}

function erro(status: number, msg: string) {
  return new NextResponse(msg, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ owner: string; repo: string; feature: string }> }) {
  const { owner, repo, feature } = await params;
  const user = await currentUser();
  if (!user) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search)}`, req.url));
  if (!RE_NAME.test(owner) || !RE_NAME.test(repo) || !RE_FEATURE.test(feature)) return erro(400, "Pedido inválido.");
  const ctx = await loadSquad(user, owner, repo);
  if (!ctx) return erro(404, "Squad não encontrada.");

  const prs = await listSquadPRs(ctx);
  const entry = (await listFeatureIds(ctx)).find((i) => i.id === feature);
  if (!entry) return erro(404, "Feature não encontrada.");
  const f = await loadFeature(ctx, feature, entry.branch, prs);
  const ref = refDaFeature(ctx, f);
  const lista = await arquivosDaFeature(ctx, f);
  const cx: Contexto = {
    squad: ctx.config.nome || repo,
    feature,
    titulo: f.titulo,
    geradoEm: new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
  };
  const ler = async (a: ArquivoEntrega) => (await lerBytes(ctx, a.path, ref)) ?? Buffer.alloc(0);
  const sp = req.nextUrl.searchParams;

  // ---- um arquivo
  const caminho = sp.get("arquivo");
  if (caminho) {
    const a = lista.find((x) => x.path === caminho);
    if (!a) return erro(404, "Este arquivo não faz parte da entrega da feature.");
    const formato = (sp.get("formato") ?? "original") as Formato | "original";
    if (!FORMATOS.includes(formato)) return erro(400, "Formato inválido. Use md, txt, docx, pdf ou original.");
    const bytes = await ler(a);
    if (formato === "original" || !a.texto) return arquivo(bytes, "application/octet-stream", a.nome);
    const r = await exportar({ path: a.path, texto: bytes.toString("utf8") }, formato, cx);
    return arquivo(r.corpo, r.tipo, r.nome);
  }

  const textos = await Promise.all(lista.filter((a) => a.texto).map(async (a) => ({ path: a.path, texto: (await ler(a)).toString("utf8") })));
  const docs: DocFonte[] = textos.filter((d) => d.path.startsWith(`specs/${feature}/`) || d.path.startsWith("docs/"));

  // ---- dossiê (todos os documentos num arquivo só)
  const dossie = sp.get("dossie");
  if (dossie === "pdf") return arquivo(await dossiePdf(docs, cx), "application/pdf", `${feature}-dossie.pdf`);
  if (dossie === "docx")
    return arquivo(await dossieDocx(docs, cx), "application/vnd.openxmlformats-officedocument.wordprocessingml.document", `${feature}-dossie.docx`);

  // ---- pacote completo
  if (sp.get("pacote") === "zip") {
    const zip = new JSZip();
    const raiz = zip.folder(feature)!;
    const objetos = completarLocais(
      objetosDosContratos(textos.filter((t) => t.path.startsWith("contracts/"))),
      textos.find((t) => t.path === `specs/${feature}/entrega.md`)?.texto,
    );
    const leia = [
      `Entrega da feature ${feature} — ${f.titulo}`,
      `Squad: ${cx.squad}`,
      `Gerado pelo Squad Console em ${cx.geradoEm}`,
      "",
      "Conteúdo",
      "  dossie.pdf / dossie.docx   todos os documentos num arquivo só",
      "  documentos/                cada documento em .md, .txt, .docx e .pdf",
      "  arquivos/                  todos os arquivos da entrega, como estão no repositório",
      "",
      ...(objetos.length
        ? ["Objetos construídos na plataforma", ...objetos.map((o) => `  ${o.local ?? o.objeto}  (${o.camada}, ${o.colunas} colunas)  contrato: ${o.contrato}`), ""]
        : []),
      "Arquivos",
      ...lista.map((a) => `  [${a.status}] ${a.path}`),
      "",
    ].join("\n");
    raiz.file("LEIAME.txt", leia);
    raiz.file("dossie.pdf", await dossiePdf(docs, cx));
    raiz.file("dossie.docx", await dossieDocx(docs, cx));
    const pasta = raiz.folder("documentos")!;
    for (const d of docs) {
      const base = d.path.startsWith(`specs/${feature}/`) ? d.path.split("/").pop()!.replace(/\.[^.]+$/, "") : d.path.replace(/\//g, "_").replace(/\.[^.]+$/, "");
      pasta.file(`${base}.md`, d.texto);
      pasta.file(`${base}.txt`, paraTxt(d, cx));
      pasta.file(`${base}.docx`, (await exportar(d, "docx", cx)).corpo);
      pasta.file(`${base}.pdf`, (await exportar(d, "pdf", cx)).corpo);
    }
    const arqs = raiz.folder("arquivos")!;
    for (const a of lista) arqs.file(a.path, await ler(a));
    const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    return arquivo(buf, "application/zip", `${feature}-entrega.zip`);
  }

  return erro(400, `Informe ?arquivo=, ?dossie= ou ?pacote=zip. Documentos disponíveis: ${docs.map((d) => tituloDoc(d.path)).join(", ")}`);
}
