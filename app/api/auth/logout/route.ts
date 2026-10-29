import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST() {
  const session = await getSession();
  session.destroy();
  return NextResponse.redirect(`${env.appUrl}/`, { status: 303 });
}
