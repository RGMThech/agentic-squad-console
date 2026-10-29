import { IconLayers, IconPlus } from "@/components/Icons";
import { Shell } from "@/components/Shell";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function SquadsLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <Shell
      user={user}
      nav={[
        { href: "/squads", label: "Squads", icon: <IconLayers size={17} />, exact: true },
        { href: "/squads/new", label: "Nova squad", icon: <IconPlus size={17} /> },
      ]}
    >
      {children}
    </Shell>
  );
}
