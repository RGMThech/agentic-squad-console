import { redirect } from "next/navigation";
import { AuthCard } from "@/components/AuthCard";
import { EmailForm } from "@/components/LoginForms";
import { safeNext } from "@/lib/otp";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await currentUser().catch(() => null)) redirect("/squads");
  const { next } = await searchParams;
  return (
    <AuthCard title="Entrar" subtitle="Informe o e-mail da sua conta. Enviaremos um código de acesso de uso único — não há senha.">
      <EmailForm next={safeNext(next)} />
    </AuthCard>
  );
}
