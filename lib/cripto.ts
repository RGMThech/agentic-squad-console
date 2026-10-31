// AES-256-GCM para segredos guardados no banco. Formato: v1.<iv>.<tag>.<dados> (base64url).
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function chave(segredo: string): Buffer {
  return createHash("sha256").update(`squad-console/conexoes:${segredo}`).digest();
}

export function cifrarCom(segredo: string, texto: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", chave(segredo), iv);
  const dados = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), dados.toString("base64url")].join(".");
}

export function decifrarCom(segredo: string, selado: string): string {
  const [v, iv, tag, dados] = selado.split(".");
  if (v !== "v1" || !iv || !tag || !dados) throw new Error("Segredo da conexão em formato desconhecido.");
  try {
    const d = createDecipheriv("aes-256-gcm", chave(segredo), Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(dados, "base64url")), d.final()]).toString("utf8");
  } catch {
    throw new Error("Não consegui abrir a chave do GitHub App desta conexão. CONEXOES_KEY (ou SESSION_SECRET) mudou? Cadastre a chave de novo em Admin → Conexões.");
  }
}
