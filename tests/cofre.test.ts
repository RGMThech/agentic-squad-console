import { test } from "node:test";
import assert from "node:assert/strict";
import { cifrarCom, decifrarCom } from "../lib/cripto.ts";

const K = "chave-de-teste-com-tamanho-suficiente-123";

test("chave de App próprio cifrada e recuperada", () => {
  const pem = "-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----";
  const s = cifrarCom(K, pem);
  assert.ok(s.startsWith("v1.") && !s.includes("abc"));
  assert.notEqual(cifrarCom(K, pem), s, "IV aleatório");
  assert.equal(decifrarCom(K, s), pem);
});

test("outra chave ou dado adulterado não abre", () => {
  const s = cifrarCom(K, "segredo");
  assert.throws(() => decifrarCom("outra-chave", s), /CONEXOES_KEY/);
  const partes = s.split(".");
  partes[3] = Buffer.from("outra coisa").toString("base64url");
  assert.throws(() => decifrarCom(K, partes.join(".")), /CONEXOES_KEY/);
});
