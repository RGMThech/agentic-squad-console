// Exporta documentos da squad (markdown e arquivos de código) para TXT, DOCX e PDF.
// Sem dependências do Next: usado pela rota de download e pelos testes.

import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Footer,
  HeadingLevel,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type ParagraphChild,
} from "docx";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { gfm } from "micromark-extension-gfm";
import YAML from "yaml";

export type Formato = "md" | "txt" | "docx" | "pdf";
export type DocFonte = { path: string; texto: string };
export type Contexto = { squad: string; feature: string; titulo: string; geradoEm: string };

type No = { type: string; value?: string; depth?: number; ordered?: boolean; start?: number; checked?: boolean | null; url?: string; alt?: string; lang?: string; children?: No[] };

const LINGUAGEM: Record<string, string> = { sql: "sql", py: "python", yml: "yaml", yaml: "yaml", json: "json", sh: "bash", toml: "toml", csv: "csv" };

/** Separa o front matter YAML do corpo. */
export function separar(texto: string): { meta: [string, string][]; corpo: string } {
  const m = texto.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { meta: [], corpo: texto };
  let d: Record<string, unknown> = {};
  try {
    d = (YAML.parse(m[1], { schema: "failsafe" }) ?? {}) as Record<string, unknown>; // "001" continua "001"
  } catch {
    return { meta: [], corpo: texto };
  }
  const meta = Object.entries(d)
    .filter(([, v]) => v !== "" && v !== null && v !== undefined)
    .map(([k, v]) => [k, typeof v === "object" ? JSON.stringify(v) : String(v)] as [string, string]);
  return { meta, corpo: texto.slice(m[0].length) };
}

/** Arquivo de código vira um bloco de código em markdown; markdown fica como está. */
export function comoMarkdown(doc: DocFonte): string {
  if (/\.(md|markdown)$/i.test(doc.path)) return doc.texto;
  const ext = doc.path.split(".").pop()?.toLowerCase() ?? "";
  return "```" + (LINGUAGEM[ext] ?? "") + "\n" + doc.texto.replace(/\n$/, "") + "\n```\n";
}

function arvore(md: string): No {
  return fromMarkdown(md.replace(/<!--[\s\S]*?-->/g, ""), { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] }) as unknown as No;
}

function textoPlano(n: No): string {
  if (n.type === "text" || n.type === "inlineCode" || n.type === "code") return n.value ?? "";
  if (n.type === "break") return "\n";
  if (n.type === "image") return n.alt ?? "";
  return (n.children ?? []).map(textoPlano).join("");
}

export function nomeBase(path: string): string {
  return (path.split("/").pop() ?? path).replace(/\.[^.]+$/, "");
}

const TITULOS: Record<string, string> = {
  "pedido": "Pedido original",
  "spec": "Especificação (spec)",
  "design": "Design",
  "tasks": "Tarefas",
  "qa-report": "Relatório de QA",
  "review": "Parecer do revisor",
  "entrega": "Entrega",
};

export function tituloDoc(path: string): string {
  const b = nomeBase(path);
  return path.startsWith("specs/") && TITULOS[b] ? TITULOS[b] : path;
}

// ----------------------------------------------------------------- TXT

export function paraTxt(doc: DocFonte, cx: Contexto): string {
  const { meta, corpo } = separar(doc.texto);
  const cab = [
    tituloDoc(doc.path),
    "=".repeat(Math.min(80, tituloDoc(doc.path).length)),
    `Squad: ${cx.squad} · Feature: ${cx.feature} · Arquivo: ${doc.path}`,
    `Gerado pelo Squad Console em ${cx.geradoEm}`,
    ...(meta.length ? ["", ...meta.map(([k, v]) => `${k}: ${v}`)] : []),
    "",
    "",
  ];
  return cab.join("\n") + corpo.replace(/<!--[\s\S]*?-->/g, "").trim() + "\n";
}

// ----------------------------------------------------------------- DOCX

type Estilo = { bold?: boolean; italics?: boolean; strike?: boolean; code?: boolean };

function inlineDocx(nos: No[], e: Estilo = {}): ParagraphChild[] {
  const out: ParagraphChild[] = [];
  for (const n of nos) {
    switch (n.type) {
      case "text":
        out.push(new TextRun({ text: n.value ?? "", bold: e.bold, italics: e.italics, strike: e.strike }));
        break;
      case "inlineCode":
        out.push(new TextRun({ text: n.value ?? "", font: "Consolas", size: 19, shading: { type: ShadingType.CLEAR, color: "auto", fill: "EEF2F7" }, bold: e.bold }));
        break;
      case "strong":
        out.push(...inlineDocx(n.children ?? [], { ...e, bold: true }));
        break;
      case "emphasis":
        out.push(...inlineDocx(n.children ?? [], { ...e, italics: true }));
        break;
      case "delete":
        out.push(...inlineDocx(n.children ?? [], { ...e, strike: true }));
        break;
      case "break":
        out.push(new TextRun({ text: "", break: 1 }));
        break;
      case "link":
        out.push(new ExternalHyperlink({ link: n.url ?? "", children: [new TextRun({ text: textoPlano(n), style: "Hyperlink" })] }));
        break;
      case "image":
        out.push(new TextRun({ text: `[imagem: ${n.alt ?? ""}]`, italics: true }));
        break;
      default:
        if (n.children) out.push(...inlineDocx(n.children, e));
        else if (n.value) out.push(new TextRun({ text: n.value }));
    }
  }
  return out;
}

const HEADING = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6];
const borda = { style: BorderStyle.SINGLE, size: 4, color: "CFD9E5" };

function blocosDocx(nos: No[], nivel = 0, deslocamento = 0): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  for (const n of nos) {
    switch (n.type) {
      case "heading":
        out.push(new Paragraph({ heading: HEADING[Math.min(5, (n.depth ?? 1) - 1 + deslocamento)], children: inlineDocx(n.children ?? []) }));
        break;
      case "paragraph":
        out.push(new Paragraph({ children: inlineDocx(n.children ?? []), spacing: { after: 120 } }));
        break;
      case "list": {
        let i = n.start ?? 1;
        for (const item of n.children ?? []) {
          const marca = item.checked === true ? "☑ " : item.checked === false ? "☐ " : "";
          const [primeiro, ...resto] = item.children ?? [];
          const filhos = primeiro?.type === "paragraph" ? inlineDocx(primeiro.children ?? []) : [];
          const prefixo = n.ordered ? `${i++}. ${marca}` : marca;
          out.push(
            new Paragraph({
              ...(n.ordered ? { indent: { left: 360 * (nivel + 1), hanging: 280 } } : { bullet: { level: Math.min(nivel, 8) } }),
              children: [new TextRun({ text: prefixo }), ...filhos],
              spacing: { after: 60 },
            }),
          );
          const sub = primeiro?.type === "paragraph" ? resto : item.children ?? [];
          out.push(...blocosDocx(sub, nivel + 1, deslocamento));
        }
        break;
      }
      case "code":
        for (const linha of (n.value ?? "").split("\n"))
          out.push(
            new Paragraph({
              children: [new TextRun({ text: linha || " ", font: "Consolas", size: 18 })],
              shading: { type: ShadingType.CLEAR, color: "auto", fill: "F4F7FB" },
              spacing: { after: 0, line: 260 },
            }),
          );
        out.push(new Paragraph({ children: [] }));
        break;
      case "blockquote":
        for (const p of blocosDocx(n.children ?? [], nivel, deslocamento))
          out.push(p instanceof Paragraph ? p : p);
        break;
      case "table": {
        const linhas = n.children ?? [];
        const ncol = Math.max(...linhas.map((l) => (l.children ?? []).length), 1);
        out.push(
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: { top: borda, bottom: borda, left: borda, right: borda, insideHorizontal: borda, insideVertical: borda },
            rows: linhas.map(
              (l, li) =>
                new TableRow({
                  tableHeader: li === 0,
                  children: Array.from({ length: ncol }, (_, ci) => {
                    const cel = (l.children ?? [])[ci];
                    return new TableCell({
                      shading: li === 0 ? { type: ShadingType.CLEAR, color: "auto", fill: "E8F2FB" } : undefined,
                      children: [new Paragraph({ children: inlineDocx(cel?.children ?? [], { bold: li === 0 }) })],
                    });
                  }),
                }),
            ),
          }),
        );
        out.push(new Paragraph({ children: [] }));
        break;
      }
      case "thematicBreak":
        out.push(new Paragraph({ border: { bottom: borda }, children: [] }));
        break;
      default:
        if (n.children) out.push(...blocosDocx(n.children, nivel, deslocamento));
    }
  }
  return out;
}

function capaDocx(titulo: string, meta: [string, string][], cx: Contexto, path?: string): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: titulo })] }),
    new Paragraph({
      children: [new TextRun({ text: `${cx.squad} · ${cx.feature}${path ? ` · ${path}` : ""}`, color: "5A6B85", size: 20 })],
      spacing: { after: 60 },
    }),
    new Paragraph({ children: [new TextRun({ text: `Gerado pelo Squad Console em ${cx.geradoEm}`, color: "5A6B85", size: 18 })], spacing: { after: 200 } }),
  ];
  if (meta.length)
    out.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: { top: borda, bottom: borda, left: borda, right: borda, insideHorizontal: borda, insideVertical: borda },
        rows: meta.map(
          ([k, v]) =>
            new TableRow({
              children: [
                new TableCell({ width: { size: 28, type: WidthType.PERCENTAGE }, shading: { type: ShadingType.CLEAR, color: "auto", fill: "F4F7FB" }, children: [new Paragraph({ children: [new TextRun({ text: k, bold: true, size: 19 })] })] }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: v, size: 19 })] })] }),
              ],
            }),
        ),
      }),
      new Paragraph({ children: [] }),
    );
  return out;
}

function documentoDocx(secoes: (Paragraph | Table)[]): Document {
  return new Document({
    creator: "Squad Console",
    styles: {
      default: { document: { run: { font: "Calibri", size: 22 } } },
    },
    sections: [
      {
        properties: { page: { margin: { top: 1000, bottom: 1000, left: 1100, right: 1100 } } },
        footers: {
          default: new Footer({
            children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ children: ["Página ", PageNumber.CURRENT, " de ", PageNumber.TOTAL_PAGES], size: 16, color: "5A6B85" })] })],
          }),
        },
        children: secoes,
      },
    ],
  });
}

export async function paraDocx(doc: DocFonte, cx: Contexto): Promise<Buffer> {
  const { meta, corpo } = separar(comoMarkdown(doc));
  return Packer.toBuffer(documentoDocx([...capaDocx(tituloDoc(doc.path), meta, cx, doc.path), ...blocosDocx(arvore(corpo).children ?? [])]));
}

/** Um único DOCX com todos os documentos da entrega, cada um numa seção. */
export async function dossieDocx(docs: DocFonte[], cx: Contexto): Promise<Buffer> {
  const corpo: (Paragraph | Table)[] = [...capaDocx(`Dossiê da entrega — ${cx.titulo}`, [], cx)];
  corpo.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Conteúdo")] }));
  for (const d of docs) corpo.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun(`${tituloDoc(d.path)} — ${d.path}`)] }));
  for (const d of docs) {
    const { meta, corpo: c } = separar(comoMarkdown(d));
    corpo.push(new Paragraph({ pageBreakBefore: true, heading: HeadingLevel.HEADING_1, children: [new TextRun(tituloDoc(d.path))] }));
    corpo.push(new Paragraph({ children: [new TextRun({ text: d.path, color: "5A6B85", size: 18 })], spacing: { after: 120 } }));
    if (meta.length) corpo.push(new Paragraph({ children: [new TextRun({ text: meta.map(([k, v]) => `${k}: ${v}`).join(" · "), color: "5A6B85", size: 18 })], spacing: { after: 160 } }));
    corpo.push(...blocosDocx(arvore(c).children ?? [], 0, 1));
  }
  return Packer.toBuffer(documentoDocx(corpo));
}

// ----------------------------------------------------------------- PDF

type Pdf = Record<string, unknown> | string;

function inlinePdf(nos: No[], e: Estilo = {}): Pdf[] {
  const out: Pdf[] = [];
  for (const n of nos) {
    switch (n.type) {
      case "text":
        out.push({ text: n.value ?? "", bold: e.bold, italics: e.italics, decoration: e.strike ? "lineThrough" : undefined });
        break;
      case "inlineCode":
        out.push({ text: n.value ?? "", background: "#eef2f7", color: "#0b1530", bold: e.bold });
        break;
      case "strong":
        out.push(...inlinePdf(n.children ?? [], { ...e, bold: true }));
        break;
      case "emphasis":
        out.push(...inlinePdf(n.children ?? [], { ...e, italics: true }));
        break;
      case "delete":
        out.push(...inlinePdf(n.children ?? [], { ...e, strike: true }));
        break;
      case "break":
        out.push("\n");
        break;
      case "link":
        out.push({ text: textoPlano(n), link: n.url, color: "#0072bc", decoration: "underline" });
        break;
      case "image":
        out.push({ text: `[imagem: ${n.alt ?? ""}]`, italics: true });
        break;
      default:
        if (n.children) out.push(...inlinePdf(n.children, e));
        else if (n.value) out.push(n.value);
    }
  }
  return out;
}

const TAM_TITULO = [17, 14.5, 12.5, 11.5, 11, 10.5];

function blocosPdf(nos: No[], deslocamento = 0): Pdf[] {
  const out: Pdf[] = [];
  for (const n of nos) {
    switch (n.type) {
      case "heading": {
        const nivel = Math.min(5, (n.depth ?? 1) - 1 + deslocamento);
        out.push({ text: inlinePdf(n.children ?? []), fontSize: TAM_TITULO[nivel], bold: true, color: "#0b1530", margin: [0, nivel < 2 ? 12 : 8, 0, 4], headlineLevel: nivel + 1 });
        break;
      }
      case "paragraph":
        out.push({ text: inlinePdf(n.children ?? []), margin: [0, 0, 0, 6] });
        break;
      case "list": {
        const itens = (n.children ?? []).map((item) => {
          const marca = item.checked === true ? "☑ " : item.checked === false ? "☐ " : "";
          const [primeiro, ...resto] = item.children ?? [];
          const cab = primeiro?.type === "paragraph" ? { text: [marca, ...inlinePdf(primeiro.children ?? [])] } : null;
          const sub = blocosPdf(primeiro?.type === "paragraph" ? resto : item.children ?? [], deslocamento);
          return { stack: [...(cab ? [cab] : []), ...sub], margin: [0, 0, 0, 2] };
        });
        out.push(n.ordered ? { ol: itens, start: n.start ?? 1, margin: [0, 0, 0, 6] } : { ul: itens, margin: [0, 0, 0, 6] });
        break;
      }
      case "code":
        out.push({
          table: { widths: ["*"], body: [[{ text: n.value ?? "", fontSize: 8, color: "#0b1530", preserveLeadingSpaces: true }]] },
          layout: { fillColor: () => "#f4f7fb", hLineColor: () => "#e1e8f0", vLineColor: () => "#e1e8f0", paddingLeft: () => 6, paddingRight: () => 6, paddingTop: () => 5, paddingBottom: () => 5 },
          margin: [0, 2, 0, 8],
        });
        break;
      case "blockquote":
        out.push({
          table: { widths: [3, "*"], body: [["", { stack: blocosPdf(n.children ?? [], deslocamento) }]] },
          layout: { fillColor: (_r: number, _n: unknown, c: number) => (c === 0 ? "#f2a900" : null), hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: (i: number) => (i === 1 ? 8 : 0) },
          margin: [0, 2, 0, 8],
        });
        break;
      case "table": {
        const linhas = n.children ?? [];
        const ncol = Math.max(...linhas.map((l) => (l.children ?? []).length), 1);
        out.push({
          table: {
            headerRows: 1,
            widths: Array(ncol).fill("*"),
            body: linhas.map((l, li) =>
              Array.from({ length: ncol }, (_, ci) => {
                const cel = (l.children ?? [])[ci];
                return { text: inlinePdf(cel?.children ?? [], { bold: li === 0 }), fontSize: 8, fillColor: li === 0 ? "#e8f2fb" : undefined };
              }),
            ),
          },
          layout: { hLineColor: () => "#cfd9e5", vLineColor: () => "#cfd9e5", hLineWidth: () => 0.5, vLineWidth: () => 0.5 },
          margin: [0, 2, 0, 8],
        });
        break;
      }
      case "thematicBreak":
        out.push({ canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: "#cfd9e5" }], margin: [0, 6, 0, 6] });
        break;
      default:
        if (n.children) out.push(...blocosPdf(n.children, deslocamento));
    }
  }
  return out;
}

function capaPdf(titulo: string, meta: [string, string][], cx: Contexto, path?: string): Pdf[] {
  const out: Pdf[] = [
    { text: titulo, fontSize: 20, bold: true, color: "#0b1530" },
    { text: `${cx.squad} · ${cx.feature}${path ? ` · ${path}` : ""}`, color: "#5a6b85", fontSize: 9, margin: [0, 4, 0, 0] },
    { text: `Gerado pelo Squad Console em ${cx.geradoEm}`, color: "#5a6b85", fontSize: 8, margin: [0, 2, 0, 10] },
  ];
  if (meta.length)
    out.push({
      table: { widths: [110, "*"], body: meta.map(([k, v]) => [{ text: k, bold: true, fontSize: 8.5 }, { text: v, fontSize: 8.5 }]) },
      layout: { fillColor: (_r: number, _n: unknown, c: number) => (c === 0 ? "#f4f7fb" : null), hLineColor: () => "#e1e8f0", vLineColor: () => "#e1e8f0", hLineWidth: () => 0.5, vLineWidth: () => 0.5 },
      margin: [0, 0, 0, 12],
    });
  return out;
}

async function gerarPdf(content: Pdf[], titulo: string): Promise<Buffer> {
  const pdfmake = (await import("pdfmake")).default as unknown as {
    setFonts(f: unknown): void;
    setUrlAccessPolicy(f: (u: string) => boolean): void;
    createPdf(d: unknown): { getBuffer(): Promise<Buffer> };
  };
  const fontes = (await import("pdfmake/fonts/Roboto.js" as string)).default;
  pdfmake.setFonts(fontes);
  pdfmake.setUrlAccessPolicy(() => false); // nada de baixar recursos externos
  const doc = {
    info: { title: titulo, creator: "Squad Console" },
    pageSize: "A4",
    pageMargins: [40, 40, 40, 44],
    defaultStyle: { font: "Roboto", fontSize: 9.5, lineHeight: 1.25, color: "#1d2740" },
    footer: (atual: number, total: number) => ({ text: `${titulo} · página ${atual} de ${total}`, alignment: "right", fontSize: 7.5, color: "#5a6b85", margin: [40, 14, 40, 0] }),
    content,
  };
  return Buffer.from(await pdfmake.createPdf(doc).getBuffer());
}

export async function paraPdf(doc: DocFonte, cx: Contexto): Promise<Buffer> {
  const { meta, corpo } = separar(comoMarkdown(doc));
  return gerarPdf([...capaPdf(tituloDoc(doc.path), meta, cx, doc.path), ...blocosPdf(arvore(corpo).children ?? [])], `${cx.feature} · ${tituloDoc(doc.path)}`);
}

/** Um único PDF com todos os documentos da entrega, cada um começando numa página nova. */
export async function dossiePdf(docs: DocFonte[], cx: Contexto): Promise<Buffer> {
  const content: Pdf[] = [...capaPdf(`Dossiê da entrega — ${cx.titulo}`, [], cx)];
  content.push({ text: "Conteúdo", fontSize: 13, bold: true, margin: [0, 6, 0, 4] });
  content.push({ ul: docs.map((d) => `${tituloDoc(d.path)} — ${d.path}`) });
  for (const d of docs) {
    const { meta, corpo } = separar(comoMarkdown(d));
    content.push({ text: tituloDoc(d.path), fontSize: 17, bold: true, pageBreak: "before" });
    content.push({ text: d.path + (meta.length ? `  ·  ${meta.map(([k, v]) => `${k}: ${v}`).join(" · ")}` : ""), fontSize: 8, color: "#5a6b85", margin: [0, 2, 0, 8] });
    content.push(...blocosPdf(arvore(corpo).children ?? [], 1));
  }
  return gerarPdf(content, `${cx.feature} · dossiê`);
}

export async function exportar(doc: DocFonte, formato: Formato, cx: Contexto): Promise<{ corpo: Buffer; tipo: string; nome: string }> {
  const base = `${cx.feature}-${nomeBase(doc.path)}`;
  switch (formato) {
    case "md":
      return { corpo: Buffer.from(doc.texto, "utf8"), tipo: "text/markdown; charset=utf-8", nome: doc.path.split("/").pop() ?? `${base}.md` };
    case "txt":
      return { corpo: Buffer.from(paraTxt(doc, cx), "utf8"), tipo: "text/plain; charset=utf-8", nome: `${base}.txt` };
    case "docx":
      return { corpo: await paraDocx(doc, cx), tipo: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", nome: `${base}.docx` };
    case "pdf":
      return { corpo: await paraPdf(doc, cx), tipo: "application/pdf", nome: `${base}.pdf` };
  }
}
