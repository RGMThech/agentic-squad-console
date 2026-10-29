import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeGates,
  isEditablePath,
  nextFeatureId,
  nextStep,
  openDoubts,
  parseFrontmatter,
  parseMembers,
  parseRunRecords,
  parseRunTitle,
  parseTasks,
  resolveRole,
  setFrontmatter,
  slugify,
  validateConfigContent,
} from "../lib/core.ts";

const SPEC = `---
id: 001
titulo: Inadimplência mensal
versao: 1.0
status: em_revisao        # rascunho | em_revisao | aprovado
aprovado_por:
aprovado_em:
---

# Inadimplência

## 11. Dúvidas abertas
- [ ] Qual o corte de dias de atraso?
- [x] Já resolvida

## 12. Decisões
- [ ] isto não é dúvida
`;

test("front matter: lê como texto (id 001 não vira número)", () => {
  const { data, body } = parseFrontmatter(SPEC);
  assert.equal(data.id, "001");
  assert.equal(data.status, "em_revisao");
  assert.ok(!data.aprovado_por);
  assert.ok(body.startsWith("\n# Inadimplência") || body.startsWith("# Inadimplência"));
});

test("front matter: aprovação preserva o resto do arquivo", () => {
  const out = setFrontmatter(SPEC, { status: "aprovado", aprovado_por: "mellrodrigo", aprovado_em: "2026-10-29" });
  const { data, body } = parseFrontmatter(out);
  assert.equal(data.status, "aprovado");
  assert.equal(data.aprovado_por, "mellrodrigo");
  assert.equal(data.aprovado_em, "2026-10-29");
  assert.equal(data.titulo, "Inadimplência mensal");
  assert.equal(body, parseFrontmatter(SPEC).body);
});

test("front matter: chave ausente é acrescentada", () => {
  const out = setFrontmatter("---\nid: 1\n---\ncorpo", { status: "aprovado" });
  assert.equal(parseFrontmatter(out).data.status, "aprovado");
  assert.ok(out.endsWith("corpo"));
});

test("dúvidas abertas: só a seção certa e só itens desmarcados", () => {
  assert.deepEqual(openDoubts(parseFrontmatter(SPEC).body), ["Qual o corte de dias de atraso?"]);
  assert.deepEqual(openDoubts("## Dúvidas abertas\n- [x] ok\n"), []);
  assert.deepEqual(openDoubts("## 11. Dúvidas abertas\n- [ ] última seção"), ["última seção"]);
});

test("tarefas: lê a tabela do template", () => {
  const md = `| ID | Tarefa | Agente | Depende de | Entradas | Saída | Critério de pronto | Ciclos QA | Status |
|----|--------|--------|------------|----------|-------|--------------------|-----------|--------|
| T-01 | Ingestão | eng-ingestao | — | a | b | c | 1 | aprovado |
| T-02 | Silver | eng-transformacao | T-01 | a | b | c | 2 | \`em_qa\` |

## Bloqueios
| Data | Tarefa |`;
  const t = parseTasks(md);
  assert.equal(t.length, 2);
  assert.deepEqual(t[1], { id: "T-02", tarefa: "Silver", agente: "eng-transformacao", ciclos: "2", status: "em_qa" });
});

test("ids: próximo número e slug sem acento", () => {
  assert.equal(slugify("Receita Diária por Loja!"), "receita-diaria-por-loja");
  assert.equal(nextFeatureId(["000-exemplo", "007-x"], "Inadimplência mensal"), "008-inadimplencia-mensal");
  assert.equal(nextFeatureId([], "Nova"), "001-nova");
});

test("papéis: membros.yaml + permissão do GitHub", () => {
  const m = parseMembers("operadores:\n  - mellrodrigo\nmembros: ['@ana']\nleitores: []\n");
  assert.equal(resolveRole("mellrodrigo", m, "admin"), "operador");
  assert.equal(resolveRole("mellrodrigo", m, "read"), "leitor");
  assert.equal(resolveRole("ana", m, "write"), "membro");
  assert.equal(resolveRole("joao", m, "admin"), "leitor");
  assert.equal(resolveRole("joao", parseMembers("operadores: []"), "admin"), "operador");
});

test("gates: progressão completa", () => {
  const base = { hasReview: false, onMainOnly: false };
  assert.deepEqual(computeGates({ ...base }), { g1: "pendente", g2: "nao_iniciado", g3: "nao_iniciado" });
  assert.deepEqual(computeGates({ ...base, specStatus: "em_revisao" }).g1, "aguardando");
  assert.deepEqual(computeGates({ ...base, specStatus: "aprovado" }).g2, "pendente");
  assert.deepEqual(computeGates({ ...base, specStatus: "aprovado", designStatus: "aprovado", prState: "open" }).g3, "pendente");
  assert.deepEqual(
    computeGates({ specStatus: "aprovado", designStatus: "aprovado", prState: "open", hasReview: true, qaVeredito: "APROVADO", onMainOnly: false }).g3,
    "aguardando",
  );
  assert.deepEqual(computeGates({ ...base, prState: "merged" }).g3, "aprovado");
  assert.equal(nextStep(computeGates({ ...base, specStatus: "aprovado" }), "001-x").agente, "arquiteto-dados");
});

test("execuções: registro no comentário e título do run", () => {
  const body = `<!-- squad-run {"run_id": 123, "agente": "qa-data-quality", "feature": "001-x", "ator": "ana", "status": "sucesso", "custo_usd": 0.42} -->\n### ✅`;
  const [r] = parseRunRecords(body);
  assert.equal(r.run_id, "123");
  assert.equal(r.custo_usd, 0.42);
  assert.deepEqual(parseRunRecords("<!-- squad-run {quebrado -->"), []);
  assert.deepEqual(parseRunTitle("revisor · 001-x · @ana"), { agente: "revisor", feature: "001-x", ator: "ana" });
});

test("configuração: caminhos e validação", () => {
  assert.ok(isEditablePath(".claude/agents/revisor.md"));
  assert.ok(isEditablePath(".squad/members.yaml"));
  assert.ok(!isEditablePath(".github/workflows/squad-agent.yml"));
  assert.ok(!isEditablePath("../etc/passwd"));
  assert.match(validateConfigContent(".squad/members.yaml", "operadores: []\n") ?? "", /operador/);
  assert.equal(validateConfigContent(".squad/members.yaml", "operadores: [a]\nmembros: []\n"), null);
  assert.match(validateConfigContent(".squad/squad.yaml", "nome: [") ?? "", /YAML inválido/);
  assert.match(validateConfigContent(".claude/agents/x-y.md", "---\nname: outro\n---\n") ?? "", /name/);
});
