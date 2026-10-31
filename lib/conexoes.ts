import "server-only";
import type { ConexaoRow } from "./db";
import { env } from "./env";
import { errMsg, gh, missingPermissions, resetAppCache } from "./github";

export type Diagnostico = {
  ok: boolean;
  bot?: string;
  faltando: string[];
  selecao?: string;
  template: { ok: boolean; detalhe: string };
  erro?: string;
};

/** Confere uma conexão: instalação do App, permissões, "All repositories" e acesso ao template. */
export async function diagnosticar(c: ConexaoRow): Promise<Diagnostico> {
  const templateRepo = c.template || env.templateRepo;
  try {
    resetAppCache(c.owner);
    const o = await gh(c.owner);
    const perms = await missingPermissions(c.owner);
    let template = { ok: false, detalhe: "" };
    try {
      const [ow, rp] = templateRepo.split("/");
      const t = (await o.repos.get({ owner: ow, repo: rp })).data;
      template = t.is_template
        ? { ok: true, detalhe: `Template ${t.full_name} acessível.` }
        : { ok: false, detalhe: `${t.full_name} não está marcado como Template repository (Settings do repositório).` };
    } catch {
      template = { ok: false, detalhe: `A organização não enxerga ${templateRepo}. Use um template público ou um repositório dela.` };
    }
    return {
      ok: !perms.faltando.length && perms.selecao === "all" && template.ok,
      bot: `${perms.slug}[bot]`,
      faltando: perms.faltando,
      selecao: perms.selecao,
      template,
    };
  } catch (e) {
    return { ok: false, faltando: [], template: { ok: false, detalhe: "" }, erro: errMsg(e) };
  }
}

export function resumoDiagnostico(c: ConexaoRow, d: Diagnostico): string {
  if (d.erro) return `${c.owner}: ${d.erro}`;
  const partes = [`${c.owner}: App instalado (bot ${d.bot}).`];
  partes.push(d.faltando.length ? `Permissões faltando: ${d.faltando.join(", ")}.` : "Permissões completas.");
  if (d.selecao !== "all") partes.push('Instalado só em repositórios selecionados: escolha "All repositories".');
  partes.push(d.template.detalhe);
  return partes.join(" ");
}
