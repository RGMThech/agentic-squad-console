import "server-only";
import { BRAND } from "./brand";
import { env } from "./env";

type Mail = { to: string; subject: string; text: string; html: string; replyTo?: string };

function transport() {
  return import("nodemailer").then(({ default: nodemailer }) => {
    const s = env.smtp;
    return nodemailer.createTransport({
      host: s.host,
      port: s.port,
      secure: s.secure,
      auth: s.user ? { user: s.user, pass: s.pass } : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
    });
  });
}

function consoleAllowed() {
  return !env.isProduction || process.env.ALLOW_MEMORY_DB === "1";
}

/** Confere a conexão e o login no servidor SMTP (usado pelo diagnóstico). */
export async function verifyMail() {
  if (env.mailTransport === "console") {
    if (!consoleAllowed()) throw new Error("E-mail não configurado: defina SMTP_HOST, SMTP_USER e SMTP_PASS.");
    return;
  }
  await (await transport()).verify();
}

async function send(m: Mail) {
  if (env.mailTransport === "console") {
    if (!consoleAllowed()) throw new Error("E-mail não configurado: defina SMTP_HOST, SMTP_USER e SMTP_PASS.");
    console.log(`[e-mail para ${m.to}] ${m.subject}\n${m.text}`);
    return;
  }
  await (await transport()).sendMail({
    from: `${BRAND.produto} · ${BRAND.empresa} <${env.mailFrom}>`,
    to: m.to,
    subject: m.subject,
    text: m.text,
    html: m.html,
    ...(m.replyTo ? { replyTo: m.replyTo } : {}),
  });
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function layout(titulo: string, corpo: string) {
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f4f7fb;font-family:Segoe UI,Arial,sans-serif;color:#0b1530">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid #e1e8f0;border-radius:12px">
<tr><td style="background:#070f26;border-radius:12px 12px 0 0;padding:20px 28px;color:#ffffff;font-weight:700;font-size:16px">${BRAND.produto} <span style="color:#6cace4;font-size:12px;letter-spacing:.06em">· ${BRAND.assinatura}</span></td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 14px;font-size:20px">${esc(titulo)}</h1>
${corpo}
</td></tr></table>
<p style="font-size:12px;color:#5a6b85;margin:16px 0 0">Se você não esperava este e-mail, pode ignorá-lo.</p>
</td></tr></table></body></html>`;
}

export async function sendLoginCode(to: string, code: string) {
  const min = 10;
  await send({
    to,
    subject: `${code} é o seu código de acesso ao ${BRAND.produto}`,
    text: `Seu código de acesso: ${code}\nEle vale por ${min} minutos e só pode ser usado uma vez.\n\nSe não foi você, ignore este e-mail.`,
    html: layout(
      "Seu código de acesso",
      `<p style="margin:0 0 18px;font-size:15px">Use o código abaixo para entrar. Ele vale por ${min} minutos e só pode ser usado uma vez.</p>
<div style="font-size:34px;font-weight:800;letter-spacing:.3em;background:#eef3f9;border-radius:10px;padding:16px 0;text-align:center">${esc(code)}</div>
<p style="margin:18px 0 0;font-size:13px;color:#5a6b85">Nunca compartilhe este código. A equipe ${BRAND.empresa} não pede o código por telefone ou mensagem.</p>`,
    ),
  });
}

export async function sendInvite(to: string, nome: string, porQuem: string) {
  const url = `${env.appUrl}/login`;
  await send({
    to,
    subject: `Você foi convidado para o ${BRAND.produto} da ${BRAND.empresa}`,
    text: `Olá${nome ? `, ${nome}` : ""}!\n\n${porQuem} convidou você para o ${BRAND.produto}.\nPara entrar, acesse ${url} e informe este e-mail. Você vai receber um código de acesso.`,
    html: layout(
      `Olá${nome ? `, ${esc(nome)}` : ""}!`,
      `<p style="margin:0 0 18px;font-size:15px">${esc(porQuem)} convidou você para o <b>${BRAND.produto}</b> da ${BRAND.empresa}.</p>
<p style="margin:0 0 22px;font-size:15px">Para entrar, acesse o endereço abaixo e informe este e-mail. Você vai receber um código de acesso — não há senha.</p>
<p style="margin:0"><a href="${esc(url)}" style="display:inline-block;background:#0072bc;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:9px">Acessar o ${BRAND.produto}</a></p>`,
    ),
  });
}

export type PedidoConvite = { nome: string; email: string; empresa: string; cargo: string; mensagem: string; ip: string };

/** Avisa o responsável que alguém pediu convite pela landing page (responder vai direto para a pessoa). */
export async function sendPedidoConvite(para: string, p: PedidoConvite) {
  const linhas: [string, string][] = [
    ["Nome", p.nome],
    ["E-mail", p.email],
    ["Empresa", p.empresa],
    ["Cargo", p.cargo],
    ["Mensagem", p.mensagem],
  ];
  const quando = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  await send({
    to: para,
    replyTo: p.email,
    subject: `Pedido de convite: ${p.nome}${p.empresa ? ` (${p.empresa})` : ""}`,
    text: `Novo pedido de convite pela landing page do ${BRAND.produto}.\n\n${linhas.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("\n")}\n\nRecebido em ${quando}.\nPara liberar o acesso: ${env.appUrl}/admin/usuarios → Convidar. Responder este e-mail fala direto com a pessoa.`,
    html: layout(
      "Novo pedido de convite",
      `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;font-size:14px;border-collapse:collapse">
${linhas
  .filter(([, v]) => v)
  .map(([k, v]) => `<tr><td style="padding:6px 10px 6px 0;color:#5a6b85;vertical-align:top;white-space:nowrap">${k}</td><td style="padding:6px 0">${esc(v).replace(/\n/g, "<br>")}</td></tr>`)
  .join("\n")}
</table>
<p style="margin:18px 0 6px;font-size:13px;color:#5a6b85">Recebido em ${esc(quando)}. Responder este e-mail fala direto com a pessoa.</p>
<p style="margin:16px 0 0"><a href="${esc(env.appUrl)}/admin/usuarios" style="display:inline-block;background:#0072bc;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:9px">Convidar no ${BRAND.produto}</a></p>`,
    ),
  });
}
