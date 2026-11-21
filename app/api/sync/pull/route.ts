import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { pull } from "@/lib/sync";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const user = await currentUser();
  if (!user)
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const since =
    new URL(req.url).searchParams.get("since") || "1970-01-01T00:00:00.000Z";
  if (Number.isNaN(Date.parse(since)))
    return NextResponse.json({ error: "Fecha inválida" }, { status: 400 });
  const cursor = new Date().toISOString();
  return NextResponse.json(
    { ...pull(user, since), cursor },
    { headers: { "Cache-Control": "no-store" } },
  );
}
