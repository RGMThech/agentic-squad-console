import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHead } from "@/components/Shell";
import { SpecEditor } from "@/components/SpecEditor";
import { RE_FEATURE, can } from "@/lib/core";
import { getPRs, getSquad } from "@/lib/page";
import { listFeatureIds, loadFeature } from "@/lib/squad";

export const metadata = { title: "Editar spec" };

export default async function EditarSpec({ params }: { params: Promise<{ owner: string; repo: string; feature: string }> }) {
  const { owner, repo, feature } = await params;
  if (!RE_FEATURE.test(feature)) notFound();
  const ctx = await getSquad(owner, repo);
  const prs = await getPRs(owner, repo);
  const entry = (await listFeatureIds(ctx)).find((i) => i.id === feature);
  if (!entry) notFound();
  const f = await loadFeature(ctx, feature, entry.branch, prs);
  const b = `/s/${owner}/${repo}`;
  const fb = `${b}/f/${feature}`;

  const motivo = !can(ctx.role, "aprovar")
    ? "Somente operadores alteram a especificação. Peça a um operador da squad."
    : !f.spec
      ? "A spec ainda não foi criada pelo analista."
      : f.gates.g3 === "aprovado"
        ? "Esta feature já foi entregue (G3). Para mudar o que foi entregue, abra uma nova feature de evolução."
        : null;

  return (
    <>
      <PageHead
        title="Editar a especificação"
        crumbs={[{ href: b, label: ctx.config.nome || repo }, { href: fb, label: feature }, { label: "Editar spec" }]}
        subtitle={f.spec ? `${f.titulo} · versão atual ${f.spec.data.versao ?? "—"} · status ${f.spec.data.status ?? "—"}` : f.titulo}
      />
      <div className="content">
        {motivo ? (
          <div className="card card-pad stack-sm">
            <p>{motivo}</p>
            <Link href={fb} className="small">← Voltar para a feature</Link>
          </div>
        ) : (
          <SpecEditor owner={owner} repo={repo} feature={feature} inicial={f.spec!.raw} aprovada={f.spec!.data.status === "aprovado"} voltar={`${fb}?aba=spec`} />
        )}
      </div>
    </>
  );
}
