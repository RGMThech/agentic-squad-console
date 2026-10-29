import "server-only";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { RE_NAME } from "./core";
import { status } from "./github";
import { requireUser } from "./session";
import { listSquadPRs, loadSquad } from "./squad";

/** Token do GitHub revogado/expirado: refaz o login e volta para a mesma página. */
export function reauthIf401(e: unknown, next: string): void {
  if (status(e) === 401) redirect(`/api/auth/login?next=${encodeURIComponent(next)}`);
}

/** Carrega a squad uma única vez por requisição (layout + página compartilham). */
export const getSquad = cache(async (owner: string, repo: string) => {
  if (!RE_NAME.test(owner) || !RE_NAME.test(repo)) notFound();
  const user = await requireUser();
  let ctx;
  try {
    ctx = await loadSquad(user, owner, repo);
  } catch (e) {
    reauthIf401(e, `/s/${owner}/${repo}`);
    throw e;
  }
  if (!ctx) notFound();
  return ctx;
});

export const getPRs = cache(async (owner: string, repo: string) => listSquadPRs(await getSquad(owner, repo)));

export type SquadParams = Promise<{ owner: string; repo: string }>;
