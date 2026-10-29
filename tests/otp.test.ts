import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanCode, generateCode, hashCode, isValidEmail, normalizeEmail, safeNext, sameHash } from "../lib/otp.ts";

test("código: 6 dígitos, distribuído e sem padrão fixo", () => {
  const codes = new Set(Array.from({ length: 2000 }, generateCode));
  for (const c of codes) assert.match(c, /^\d{6}$/);
  assert.ok(codes.size > 1900, "códigos repetindo demais");
});

test("hash: depende do código, do e-mail e do segredo; comparação segura", () => {
  const s = "x".repeat(32);
  const h = hashCode("123456", "Ana@X.com", s);
  assert.equal(h, hashCode("123456", "ana@x.com", s), "e-mail normalizado");
  assert.notEqual(h, hashCode("123457", "ana@x.com", s));
  assert.notEqual(h, hashCode("123456", "bia@x.com", s));
  assert.notEqual(h, hashCode("123456", "ana@x.com", "y".repeat(32)));
  assert.ok(sameHash(h, h));
  assert.ok(!sameHash(h, "0".repeat(64)));
  assert.ok(!sameHash(h, "abc"));
});

test("entrada: e-mail e código normalizados", () => {
  assert.equal(normalizeEmail("  Ana@RGMtech.COM.br "), "ana@rgmtech.com.br");
  assert.ok(isValidEmail("ana@rgmtech.com.br"));
  for (const e of ["ana", "ana@", "@x.com", "a b@x.com", "ana@x"]) assert.ok(!isValidEmail(e), e);
  assert.equal(cleanCode(" 123 456 "), "123456");
  assert.equal(cleanCode("12a3456789"), "123456");
});

test("retorno após login: só caminhos internos", () => {
  assert.equal(safeNext("/s/RGMThech/squad-x"), "/s/RGMThech/squad-x");
  for (const n of ["https://evil.com", "//evil.com", "/\\evil.com", "/login/codigo", "", null, undefined])
    assert.equal(safeNext(n as string), "/squads", String(n));
});
