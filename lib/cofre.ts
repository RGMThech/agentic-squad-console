import "server-only";
import { cifrarCom, decifrarCom } from "./cripto";
import { env } from "./env";

/** Cifra segredos de conexões com CONEXOES_KEY (ou o SESSION_SECRET). */
export const cifrar = (texto: string) => cifrarCom(env.chaveConexoes, texto);
export const decifrar = (selado: string) => decifrarCom(env.chaveConexoes, selado);
