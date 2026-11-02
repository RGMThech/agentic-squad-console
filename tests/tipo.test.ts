import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CATALOGO_LEGADO, dicasPedido, parseBaseTipos, parseTipo, planejarTipo, TIPO_PADRAO, tipoDosTopicos, topicoDoTipo } from "../lib/tipo.ts";
import { categoria, categoriasDaEntrega } from "../lib/entrega.ts";
import { computeGates, nextStep, situacao } from "../lib/core.ts";

const SOFTWARE = `tipo: software
nome: Desenvolvimento de Software
rotulos: { g1: Spec, g2: Arquitetura, g3: Release }
papeis:
  especificacao: analista-requisitos
  design: arquiteto-software
  orquestracao: orquestrador
  documentacao: documentacao
entrega:
  pastas:
    src/: Código
    app/: Aplicação
    tests/: Testes
    docs/: Documentação e ADRs
`;

test("sem tipo.yaml vale o tipo dados", () => {
  assert.deepEqual(parseTipo(null), TIPO_PADRAO);
  assert.deepEqual(parseTipo("::: inválido"), TIPO_PADRAO);
});

test("lê rótulos, papéis e pastas do tipo", () => {
  const t = parseTipo(SOFTWARE);
  assert.equal(t.tipo, "software");
  assert.deepEqual(t.rotulos, { g1: "Spec", g2: "Arquitetura", g3: "Release" });
  assert.equal(t.papeis.design, "arquiteto-software");
  assert.equal(t.papeis.documentacao, "documentacao");
  assert.deepEqual(t.pastas.map((p) => p.prefixo), ["src/", "app/", "tests/", "docs/"]);
});

test("nome de agente inválido cai no padrão", () => {
  const t = parseTipo("tipo: x1\npapeis: { design: '../../etc', especificacao: Maiusculo }\n");
  assert.equal(t.papeis.design, TIPO_PADRAO.papeis.design);
  assert.equal(t.papeis.especificacao, TIPO_PADRAO.papeis.especificacao);
});

test("próximo passo e situação usam os agentes do tipo", () => {
  const papeis = parseTipo(SOFTWARE).papeis;
  const base = { specStatus: "aprovado", designStatus: undefined, hasReview: false, qaVeredito: undefined, prState: "open" as const, onMainOnly: false };
  assert.equal(nextStep(computeGates(base), "001-x", papeis).agente, "arquiteto-software");
  assert.equal(nextStep(computeGates(base), "001-x").agente, "arquiteto-dados");
  const s = situacao({ feature: "001-x", gates: computeGates(base), duvidasSemResposta: 0, duvidasTotal: 0, rodando: null, ultima: null, tarefas: [], papeis });
  assert.equal(s.agente, "arquiteto-software");
});

test("catálogo do template e plano de instanciação (igual ao instanciar_tipo.py)", () => {
  const base = parseBaseTipos(`padrao: dados
tipos:
  dados: { nome: Data Analytics, icone: chart }
  marketing: { nome: Marketing, descricao: Campanhas, icone: megaphone }
especifico_do_padrao:
  - .claude/agents/**
  - templates/spec.md
  - scripts/validate_naming.py
`)!;
  assert.deepEqual(base.tipos.map((t) => t.id), ["dados", "marketing"]);
  const arquivos = [
    "AGENTS.md",
    ".claude/agents/arquiteto-dados.md",
    ".claude/skills/lgpd-checklist/SKILL.md",
    "templates/spec.md",
    "templates/tasks.md",
    "scripts/validate_naming.py",
    "scripts/check_spec.py",
    "tipos/base.yaml",
    "tipos/marketing/.claude/agents/redator.md",
    "tipos/marketing/templates/spec.md",
    "tipos/marketing/scripts/check_marketing.py",
  ];
  const mk = planejarTipo(arquivos, base, "marketing");
  assert.deepEqual(mk.apagar, [".claude/agents/arquiteto-dados.md", "scripts/validate_naming.py", "tipos/base.yaml", "tipos/marketing/.claude/agents/redator.md", "tipos/marketing/scripts/check_marketing.py", "tipos/marketing/templates/spec.md"]);
  assert.deepEqual(mk.copiar, {
    ".claude/agents/redator.md": "tipos/marketing/.claude/agents/redator.md",
    "templates/spec.md": "tipos/marketing/templates/spec.md",
    "scripts/check_marketing.py": "tipos/marketing/scripts/check_marketing.py",
  });
  const dados = planejarTipo(arquivos, base, "dados");
  assert.ok(dados.apagar.every((p) => p.startsWith("tipos/")));
  assert.deepEqual(dados.copiar, {});
  assert.throws(() => planejarTipo(arquivos, base, "jardinagem"));
});

test("catálogo inválido ou sem o tipo padrão é ignorado", () => {
  assert.equal(parseBaseTipos(null), null);
  assert.equal(parseBaseTipos("padrao: x\ntipos: { dados: {} }"), null);
  assert.equal(CATALOGO_LEGADO[0].id, "dados");
});

test("catálogo real do template, se estiver ao lado", () => {
  let texto = "";
  try {
    texto = readFileSync(new URL("../../agentic-data-squad/tipos/base.yaml", import.meta.url), "utf8");
  } catch {
    return; // template não está nesta máquina
  }
  const base = parseBaseTipos(texto)!;
  assert.deepEqual(base.tipos.map((t) => t.id), ["dados", "software", "marketing", "produto", "ia-ml", "vendas", "atendimento"]);
});

test("tipo pelos tópicos do repositório", () => {
  assert.equal(tipoDosTopicos(["agentic-squad", topicoDoTipo("vendas")]), "vendas");
  assert.equal(tipoDosTopicos(["agentic-squad"]), "dados");
  assert.equal(tipoDosTopicos(undefined), "dados");
});

test("grupos da entrega seguem as pastas do tipo", () => {
  const pastas = parseTipo(SOFTWARE).pastas;
  assert.equal(categoria("src/api/pix.ts", "001-x", pastas).categoria, "src");
  assert.equal(categoria("tests/test_pix.py", "001-x", pastas).categoria, "testes");
  assert.equal(categoria("README.md", "001-x", pastas).categoria, "outros");
  assert.equal(categoria("specs/001-x/spec.md", "001-x", pastas).categoria, "documentos");
  const g = categoriasDaEntrega(pastas).map((x) => x.chave);
  assert.deepEqual(g, ["documentos", "src", "app", "testes", "docs", "outros"]);
  // dados: dbt (models/) entra como pipeline
  assert.equal(categoria("models/silver/slv_x.sql", "001-x").categoria, "pipelines");
});

test("formulário de pedido tem exemplos por tipo", () => {
  assert.equal(dicasPedido("marketing").decisao.rotulo, "Meta");
  assert.equal(dicasPedido("desconhecido").decisao.rotulo, dicasPedido("dados").decisao.rotulo);
});
