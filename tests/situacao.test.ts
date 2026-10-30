import { test } from "node:test";
import assert from "node:assert/strict";
import { resumoExecucao, situacao, type SituacaoInput } from "../lib/core.ts";

const base: SituacaoInput = {
  feature: "001-x",
  gates: { g1: "aprovado", g2: "aprovado", g3: "pendente" },
  duvidasSemResposta: 0,
  duvidasTotal: 0,
  rodando: null,
  ultima: null,
  tarefas: [],
};

test("execução em andamento vem antes de qualquer outra coisa", () => {
  const s = situacao({ ...base, gates: { g1: "aguardando", g2: "nao_iniciado", g3: "nao_iniciado" }, duvidasSemResposta: 3, rodando: { agente: "analista-requisitos", desde: "", fila: false } });
  assert.equal(s.tipo, "rodando");
  assert.match(s.titulo, /analista-requisitos trabalhando/);
  assert.equal(s.acao, "aguardar");
});

test("falha na última execução", () => {
  const s = situacao({ ...base, ultima: { agente: "orquestrador", ok: false, resumo: "" } });
  assert.equal(s.tipo, "erro");
  assert.equal(s.agente, "orquestrador");
});

test("gates e dúvidas pedem o Operador", () => {
  const g1 = { g1: "aguardando", g2: "nao_iniciado", g3: "nao_iniciado" } as const;
  assert.equal(situacao({ ...base, gates: g1, duvidasSemResposta: 2, duvidasTotal: 3 }).acao, "responder");
  assert.equal(situacao({ ...base, gates: g1, duvidasTotal: 3 }).acao, "enviar_respostas");
  assert.equal(situacao({ ...base, gates: g1 }).acao, "g1");
  assert.equal(situacao({ ...base, gates: { g1: "aprovado", g2: "aguardando", g3: "nao_iniciado" } }).acao, "g2");
  assert.equal(situacao({ ...base, gates: { g1: "aprovado", g2: "aprovado", g3: "aguardando" } }).acao, "g3");
});

test("orquestrador bloqueado: a squad para e diz que precisa de você", () => {
  const s = situacao({
    ...base,
    ultima: { agente: "orquestrador", ok: true, resumo: "**Decisão necessária (Operador):** o G3 não está pronto. Bloqueio: caminho do Volume." },
    tarefas: [{ status: "bloqueado" }, { status: "bloqueado" }],
  });
  assert.equal(s.tipo, "voce");
  assert.match(s.titulo, /bloqueada/);
  assert.equal(s.agente, "orquestrador");
  assert.match(s.instrucao ?? "", /Resolvi as pendências/);
});

test("execução terminou sem concluir: pede para continuar", () => {
  const s = situacao({ ...base, ultima: { agente: "orquestrador", ok: true, resumo: "T-01 e T-02 prontas." }, tarefas: [{ status: "aprovado" }, { status: "pendente" }] });
  assert.equal(s.tipo, "voce");
  assert.match(s.detalhe, /1 de 2 tarefas/);
  assert.equal(s.agente, "orquestrador");
});

test("design pendente sem execução: acionar o arquiteto", () => {
  const s = situacao({ ...base, gates: { g1: "aprovado", g2: "pendente", g3: "nao_iniciado" } });
  assert.equal(s.agente, "arquiteto-dados");
});

test("entregue", () => {
  assert.equal(situacao({ ...base, gates: { g1: "aprovado", g2: "aprovado", g3: "aprovado" } }).tipo, "entregue");
});

test("resumo da execução sem cabeçalho técnico", () => {
  const body = '<!-- squad-run {"run_id": "1"} -->\n### ✅ `orquestrador` — sucesso\n**Acionado por:** x · **Custo:** US$ 0.07\n\n> **Decisão necessária:** algo\n> - item';
  assert.equal(resumoExecucao(body), "**Decisão necessária:** algo\n- item");
});
