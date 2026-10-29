import { mainNav } from "@/components/MainNav";
import { Shell } from "@/components/Shell";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ContaLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <Shell user={user} nav={mainNav(user)}>
      {children}
    </Shell>
  );
}
