import { redirect } from "next/navigation";
import { AuthCard } from "@/components/AuthCard";
import { CodeForm } from "@/components/LoginForms";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Código de acesso" };

export default async function CodePage() {
  const s = await getSession();
  if (!s.pendingEmail) redirect("/login");
  return (
    <AuthCard title="Confira seu e-mail" subtitle="Se este e-mail tiver acesso, você recebeu um código de 6 dígitos. Confira também a caixa de spam.">
      <CodeForm email={s.pendingEmail} />
    </AuthCard>
  );
}
