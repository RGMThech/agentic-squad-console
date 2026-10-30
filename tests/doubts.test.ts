import { test } from "node:test";
import assert from "node:assert/strict";
import { applyAnswers, openDoubts, parseDoubts } from "../lib/core.ts";

const SPEC = `---
id: 001
status: em_revisao
---

# Inadimplência

## 10. Critérios de aceite
- [ ] isto não é dúvida

## 11. Dúvidas abertas
<!-- Spec só pode ser aprovada sem itens "- [ ]" nesta seção -->
- [ ] O corte é 90 dias corridos?
  - contexto: o legado usa dias úteis
- [ ] Cobrança judicial entra no denominador?
- [x] Qual o fuso? → America/Sao_Paulo

## 12. Decisões
| Data | Decisão |
`;

test("dúvidas: separa abertas e resolvidas, ignora outras seções", () => {
  const d = parseDoubts(SPEC);
  assert.deepEqual(d.abertas.map((x) => x.texto), ["O corte é 90 dias corridos?", "Cobrança judicial entra no denominador?"]);
  assert.deepEqual(d.resolvidas, ["Qual o fuso? → America/Sao_Paulo"]);
  assert.equal(d.abertas[0].resposta, null);
});

test("respostas: grava sob a dúvida certa, preserva o resto e mantém a dúvida aberta", () => {
  const r = applyAnswers(SPEC, new Map([["Cobrança judicial entra no denominador?", "Não.\nSó contratos ativos."]]), "ana@x.com", "2026-10-30");
  assert.equal(r.aplicadas, 1);
  const d = parseDoubts(r.texto);
  assert.equal(d.abertas[1].resposta, "Não.\nSó contratos ativos.");
  assert.equal(d.abertas[1].autor, "ana@x.com, 2026-10-30");
  assert.equal(d.abertas[0].resposta, null);
  assert.equal(openDoubts(r.texto).length, 2, "continua bloqueando o G1 até o analista processar");
  assert.ok(r.texto.includes("  - contexto: o legado usa dias úteis"));
  assert.ok(r.texto.includes("## 12. Decisões"));
  assert.ok(r.texto.startsWith("---\nid: 001"));
});

test("respostas: substituir não duplica e resposta vazia remove", () => {
  const um = applyAnswers(SPEC, new Map([["O corte é 90 dias corridos?", "Sim, corridos."]]), "a@x.com", "2026-10-30").texto;
  const dois = applyAnswers(um, new Map([["O corte é 90 dias corridos?", "Não, dias úteis."]]), "b@x.com", "2026-10-31").texto;
  assert.equal((dois.match(/Resposta do Operador/g) ?? []).length, 1);
  assert.equal(parseDoubts(dois).abertas[0].resposta, "Não, dias úteis.");
  assert.ok(dois.includes("  - contexto: o legado usa dias úteis"), "sub-itens do analista preservados");
  const vazio = applyAnswers(dois, new Map([["O corte é 90 dias corridos?", "  "]]), "b@x.com", "2026-10-31").texto;
  assert.equal(parseDoubts(vazio).abertas[0].resposta, null);
  assert.ok(!vazio.includes("Resposta do Operador"));
});

test("respostas: dúvida inexistente não altera nada; spec sem seção falha", () => {
  const r = applyAnswers(SPEC, new Map([["outra?", "x"]]), "a", "d");
  assert.equal(r.aplicadas, 0);
  assert.equal(r.texto, SPEC);
  assert.throws(() => applyAnswers("# sem seção", new Map(), "a", "d"));
});
