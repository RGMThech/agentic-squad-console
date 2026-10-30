// Registra na auditoria todo erro de renderização ou de server action. Em produção o Next
// esconde a mensagem do navegador; assim o administrador vê a causa em /admin/auditoria.
export async function register() {}

export async function onRequestError(err: unknown, request: { path: string; method: string }, context: { routePath?: string; routeType?: string }) {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registrarErro } = await import("./lib/registrar-erro");
    await registrarErro(err, request, context);
  }
}
