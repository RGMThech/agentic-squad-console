import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { comoMarkdown, dossieDocx, dossiePdf, exportar, paraTxt, separar } from "../lib/exportar.ts";

const SPEC = readFileSync(process.env.SPEC_FILE ?? new URL("./fixtures/spec-exemplo.md", import.meta.url), "utf8");
const cx = { squad: "Squad Teste", feature: "001-carga", titulo: "Carga das eleições", geradoEm: "30/10/2026 20:00" };
const SAIDA = process.env.EXPORT_DIR;

test("front matter vira cabeçalho e o corpo é preservado", () => {
  const { meta, corpo } = separar("---\nid: 001\nstatus: aprovado\nvazio: ''\n---\n# T\ntexto");
  assert.deepEqual(meta, [["id", "001"], ["status", "aprovado"]]);
  assert.equal(corpo, "# T\ntexto");
  const txt = paraTxt({ path: "specs/001-x/spec.md", texto: "---\nstatus: aprovado\n---\n# T\n<!-- oculto -->\nok" }, cx);
  assert.match(txt, /^Especificação \(spec\)\n=+/);
  assert.match(txt, /status: aprovado/);
  assert.ok(!txt.includes("oculto"));
});

test("código vira bloco de código", () => {
  assert.equal(comoMarkdown({ path: "pipelines/silver/x.sql", texto: "SELECT 1\n" }), "```sql\nSELECT 1\n```\n");
});

test("DOCX e PDF de uma spec real (tabelas, listas, acentos)", async () => {
  const docx = await exportar({ path: "specs/001-carga/spec.md", texto: SPEC }, "docx", cx);
  assert.equal(docx.corpo.subarray(0, 2).toString(), "PK");
  const pdf = await exportar({ path: "specs/001-carga/spec.md", texto: SPEC }, "pdf", cx);
  assert.equal(pdf.corpo.subarray(0, 5).toString(), "%PDF-");
  const sql = await exportar({ path: "pipelines/silver/eleicoes/slv_x.sql", texto: "-- comentário\nSELECT ação FROM t\n" }, "pdf", cx);
  assert.equal(sql.corpo.subarray(0, 5).toString(), "%PDF-");
  if (SAIDA) {
    writeFileSync(`${SAIDA}/spec.docx`, docx.corpo);
    writeFileSync(`${SAIDA}/spec.pdf`, pdf.corpo);
    writeFileSync(`${SAIDA}/sql.pdf`, sql.corpo);
  }
});

test("dossiê junta todos os documentos", async () => {
  const docs = [
    { path: "specs/001-carga/pedido.md", texto: "# Pedido\n**Título:** carga" },
    { path: "specs/001-carga/spec.md", texto: SPEC },
    { path: "contracts/slv_x.yaml", texto: "tabela: slv_x\n" },
  ];
  const pdf = await dossiePdf(docs, cx);
  const docx = await dossieDocx(docs, cx);
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.equal(docx.subarray(0, 2).toString(), "PK");
  if (SAIDA) {
    writeFileSync(`${SAIDA}/dossie.pdf`, pdf);
    writeFileSync(`${SAIDA}/dossie.docx`, docx);
  }
});
