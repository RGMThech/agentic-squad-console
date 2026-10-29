import { NextResponse, type NextRequest } from "next/server";

/**
 * Primeira barreira: sem o cookie de sessão, nenhuma área interna é servida.
 * A checagem completa (conta ativa, sessão válida, papel) acontece no servidor de cada página.
 */
export function middleware(req: NextRequest) {
  if (!req.cookies.get("squad_session")?.value) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(req.nextUrl.pathname)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/squads/:path*", "/s/:path*", "/admin/:path*", "/conta/:path*"],
};
