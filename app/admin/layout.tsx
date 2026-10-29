import { mainNav } from "@/components/MainNav";
import { Shell } from "@/components/Shell";
import { requireAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();
  return (
    <Shell user={user} nav={mainNav(user)}>
      {children}
    </Shell>
  );
}
