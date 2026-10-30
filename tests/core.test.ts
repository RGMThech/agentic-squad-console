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
  serializeMembers,
  setMemberRole,
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

test("papéis: por e-mail, sem diferenciar maiúsculas; quem não está listado não acessa", () => {
  const m = parseMembers("operadores:\n  - Ana@RGMtech.com.br\nmembros: ['@joao@rgmtech.com.br', mellrodrigo]\nleitores: [cliente@empresa.com]\n");
  assert.deepEqual(m.operadores, ["ana@rgmtech.com.br"]);
  assert.equal(resolveRole("ana@rgmtech.com.br", m, false), "operador");
  assert.equal(resolveRole("JOAO@rgmtech.com.br", m, false), "membro");
  assert.equal(resolveRole("cliente@empresa.com", m, false), "leitor");
  assert.equal(resolveRole("estranho@x.com", m, false), null);
  assert.equal(resolveRole("estranho@x.com", m, true), "operador");
});

test("equipe: mudar papel e remover mantém uma lista por pessoa", () => {
  const m = parseMembers("operadores: [ana@x.com]\nmembros: [joao@x.com]\nleitores: []\n");
  const promovido = setMemberRole(m, "JOAO@x.com", "operador");
  assert.deepEqual(promovido, { operadores: ["ana@x.com", "joao@x.com"], membros: [], leitores: [] });
  const removido = setMemberRole(promovido, "ana@x.com", null);
  assert.deepEqual(removido.operadores, ["joao@x.com"]);
  assert.deepEqual(parseMembers(serializeMembers(removido)), removido);
  assert.match(serializeMembers({ operadores: [], membros: [], leitores: [] }), /operadores: \[\]/);
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

import YAML from "yaml";
import { normalizeHost, parseLeitura, setDatabricksYaml, validateDbxConfig } from "../lib/databricks.ts";

test("databricks: normaliza host, leitura e valida campos", () => {
  assert.equal(normalizeHost("adb-123.7.azuredatabricks.net/"), "https://adb-123.7.azuredatabricks.net");
  assert.equal(normalizeHost("https://dbc-1.cloud.databricks.com/?o=123#x"), "https://dbc-1.cloud.databricks.com");
  assert.deepEqual(parseLeitura("Vendas.silver, crm\n`crm`"), ["vendas.silver", "crm"]);
  const ok = { host: "https://x.cloud.databricks.com", warehouseId: "a1b2c3d4e5f6", leitura: ["vendas"], escrita: "squad_dev.agentes" };
  assert.equal(validateDbxConfig(ok), null);
  assert.match(validateDbxConfig({ ...ok, warehouseId: "/sql/warehouses/abc" }) ?? "", /Warehouse ID/);
  assert.match(validateDbxConfig({ ...ok, escrita: "squad_dev" }) ?? "", /catalogo.schema/);
  assert.match(validateDbxConfig({ ...ok, leitura: ["a.b.c"] }) ?? "", /Leitura inválida/);
});

test("databricks: grava o bloco no squad.yaml preservando comentários", () => {
  const original = "# Configuração\nnome: X   # nome\nmodelo: sonnet\ndatabricks:\n  host: ''  # url\n  warehouse_id: ''\n";
  const out = setDatabricksYaml(original, { host: "https://h", warehouseId: "wh1", leitura: ["vendas"], escrita: "squad_dev.agentes" }, YAML);
  const d = YAML.parse(out);
  assert.equal(d.databricks.host, "https://h");
  assert.deepEqual(d.databricks.leitura, ["vendas"]);
  assert.equal(d.modelo, "sonnet");
  assert.ok(out.includes("# Configuração") && out.includes("# nome"));
  const novo = setDatabricksYaml("nome: Y\n", { host: "https://h", warehouseId: "w", leitura: [], escrita: "" }, YAML);
  assert.equal(YAML.parse(novo).databricks.warehouse_id, "w");
});
