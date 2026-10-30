import { test } from "node:test";
import assert from "node:assert/strict";
import { categoria, completarLocais, objetosDosContratos } from "../lib/entrega.ts";

test("categoriza os arquivos da entrega", () => {
  assert.deepEqual(categoria("specs/001-x/spec.md", "001-x"), { categoria: "documentos" });
  assert.deepEqual(categoria("pipelines/silver/eleicoes/slv_x.sql", "001-x"), { categoria: "pipelines", camada: "silver" });
  assert.equal(categoria("contracts/gld_x.yaml", "001-x").categoria, "contratos");
  assert.equal(categoria("tests/quality/test_x.py", "001-x").categoria, "testes");
});

test("objetos vêm dos contratos e o local é completado pelos documentos", () => {
  const objs = objetosDosContratos([
    { path: "contracts/brz_e__votos.yaml", texto: "tabela: brz_e__votos\ncamada: bronze\ncolunas:\n  - nome: a\n    pii: true\n  - nome: b\n" },
    { path: "contracts/gld_e__partido.yaml", texto: "tabela: gld_e__partido\ncamada: gold\nlocal: dev.gold.gld_e__partido\n" },
    { path: "contracts/slv_e__votos.yaml", texto: "tabela: slv_e__votos\ncamada: silver\n" },
  ]);
  assert.deepEqual(objs.map((o) => o.objeto), ["brz_e__votos", "slv_e__votos", "gld_e__partido"]);
  assert.equal(objs[0].pii, 1);
  const docs = "As tabelas ficam em eleicoes2024.bronze e eleicoes2024.silver. A silver: eleicoes2024.silver.slv_e__votos.";
  const c = completarLocais(objs, docs);
  assert.deepEqual(c.map((o) => [o.local, !!o.localInferido]), [
    ["eleicoes2024.bronze.brz_e__votos", true],
    ["eleicoes2024.silver.slv_e__votos", false],
    ["dev.gold.gld_e__partido", false],
  ]);
});
