import { store } from "./db";

type Req = { path: string; method: string };
type Ctx = { routePath?: string; routeType?: string };

/** Grava o erro na auditoria com o mesmo "ref" (digest) que a tela de erro mostra. */
export async function registrarErro(err: unknown, request: Req, context: Ctx) {
  try {
    const e = (err ?? {}) as Error & { digest?: string };
    const msg = `${e.name || "Erro"}: ${e.message || String(err)}`.replace(/\s+/g, " ");
    const onde = (e.stack || "")
      .split("\n")
      .slice(1)
      .map((l) => l.trim())
      .filter((l) => /lib\/|app\/|components\//.test(l))
      .slice(0, 3)
      .join(" | ");
    await (await store()).audit({
      actor: "sistema",
      action: "erro",
      target: `ref ${e.digest ?? "—"} · ${request.method} ${request.path} (${context.routeType ?? "?"} ${context.routePath ?? ""}) · ${msg}${onde ? ` · em ${onde}` : ""}`,
    });
  } catch (falha) {
    console.error("[onRequestError] não consegui registrar o erro:", falha);
  }
  console.error("[erro]", request.method, request.path, err);
}
