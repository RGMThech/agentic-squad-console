import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizarStatus, parseTasks } from "../lib/core.ts";

test("status com observações entre parênteses (como os agentes escrevem)", () => {
  assert.deepEqual(normalizarStatus("aprovado (QA; bronze executada)"), { status: "aprovado", nota: "QA; bronze executada" });
  assert.deepEqual(normalizarStatus("`em_qa`"), { status: "em_qa", nota: "" });
  assert.equal(normalizarStatus("Não executar — fora do escopo").status, "nao_executar");
  assert.deepEqual(normalizarStatus("resolvido_fora — feito pelo DBA"), { status: "resolvido_fora", nota: "feito pelo DBA" });
  assert.equal(normalizarStatus("Bloqueado").status, "bloqueado");
});

test("tabela de tarefas real da squad", () => {
  const md = `| ID | Tarefa | Agente | Depende de | Entradas | Saída | Critério de pronto | Ciclos QA | Status |
|----|--------|--------|---|---|---|---|---|---|
| T-00 | Inventário | eng-ingestao | — | x | y | z | 0 | aprovado (inventário entregue; G1/G2 aprovados sobre ele) |
| T-06 | GRANT | Operador | T-05 | a | b | c | 0 | aprovado (aplicado pelo Operador, conforme informado) |
| T-07 | Docs | governanca | — | a | b | c | 1 | pendente |`;
  const t = parseTasks(md);
  assert.deepEqual(t.map((x) => x.status), ["aprovado", "aprovado", "pendente"]);
  assert.match(t[1].nota, /aplicado pelo Operador/);
});

import { acrescentarNaSecao, definirStatusTarefa } from "../lib/core.ts";

const TASKS = `---
id: 001
---

# Tarefas

| ID | Tarefa | Agente | Status |
|----|--------|--------|--------|
| T-01 | A | eng | aprovado |
| T-02 | B | eng | pendente |

## Bloqueios e escalonamentos
| Data | Tarefa | Motivo | Encaminhamento |
|------|--------|--------|----------------|
|      |        |        |                |
`;

test("Operador muda o status de uma tarefa com justificativa", () => {
  const out = definirStatusTarefa(TASKS, "t-02", "nao_executar", "fora do escopo | decidido em 02/11");
  assert.match(out, /\| T-02 \| B \| eng \| nao_executar — fora do escopo \/ decidido em 02\/11 \|/);
  assert.equal(parseTasks(out)[1].status, "nao_executar");
  assert.throws(() => definirStatusTarefa(TASKS, "T-09", "aprovado"), /T-09/);
});

test("decisões e reaberturas ficam registradas em tabelas", () => {
  let out = acrescentarNaSecao(TASKS, "Decisões sobre tarefas", ["Data", "Tarefa", "Decisão", "Justificativa", "Quem"], ["2026-11-02", "T-02", "não será executada", "fora", "a@b"]);
  out = acrescentarNaSecao(out, "Decisões sobre tarefas", ["Data", "Tarefa", "Decisão", "Justificativa", "Quem"], ["2026-11-03", "T-03", "x", "y", "z"]);
  assert.equal((out.match(/## Decisões sobre tarefas/g) ?? []).length, 1);
  assert.match(out, /\| 2026-11-02 \| T-02 \| não será executada \| fora \| a@b \|\n\| 2026-11-03 \| T-03/);
  const b = acrescentarNaSecao(TASKS, "Bloqueios e escalonamentos", ["Data", "Tarefa", "Motivo", "Encaminhamento"], ["d", "t", "m", "e"]);
  assert.match(b, /\|------\|--------\|--------\|----------------\|\n\| d \| t \| m \| e \|/);
  assert.ok(!/\|      \|        \|/.test(b), "linha vazia de exemplo removida");
});

import { adicionarTarefa, computeGates } from "../lib/core.ts";

test("reabertura vira tarefa nova com o próximo número", () => {
  const { texto, id } = adicionarTarefa(TASKS, { tarefa: "Rodada 2: incluir votos | nulos", agente: "orquestrador" });
  assert.equal(id, "T-03");
  const t = parseTasks(texto);
  assert.deepEqual(t.map((x) => [x.id, x.status]), [["T-01", "aprovado"], ["T-02", "pendente"], ["T-03", "pendente"]]);
  assert.match(texto, /\| T-03 \| Rodada 2: incluir votos \/ nulos \| orquestrador \| pendente \|/);
});

test("G3 só fica pronto sem tarefas abertas", () => {
  const base = { specStatus: "aprovado", designStatus: "aprovado", qaVeredito: "APROVADO", hasReview: true, prState: "open" as const, onMainOnly: false };
  assert.equal(computeGates({ ...base, tarefasAbertas: 1 }).g3, "pendente");
  assert.equal(computeGates({ ...base, tarefasAbertas: 0 }).g3, "aguardando");
});
