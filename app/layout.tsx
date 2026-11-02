import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Squad Console", template: "%s · Squad Console" },
  description: "Console de configuração e operação de squads agênticas: dados, software, marketing, produto, IA, vendas e atendimento",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#070f26" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
