import { IconHome, IconList, IconPlus, IconSettings } from "@/components/Icons";
import { Shell } from "@/components/Shell";
import { getSquad, type SquadParams } from "@/lib/page";

export const dynamic = "force-dynamic";

export default async function SquadLayout({ children, params }: { children: React.ReactNode; params: SquadParams }) {
  const { owner, repo } = await params;
  const ctx = await getSquad(owner, repo);
  const b = `/s/${owner}/${repo}`;
  return (
    <Shell
      user={ctx.user}
      squad={{ owner, repo, nome: ctx.config.nome || repo, cliente: ctx.config.cliente }}
      nav={[
        { href: b, label: "Visão geral", icon: <IconHome size={17} />, exact: true },
        { href: `${b}/features/new`, label: "Nova feature", icon: <IconPlus size={17} /> },
        { href: `${b}/runs`, label: "Execuções e custos", icon: <IconList size={17} /> },
        { href: `${b}/config`, label: "Configuração", icon: <IconSettings size={17} /> },
      ]}
    >
      {children}
    </Shell>
  );
}
