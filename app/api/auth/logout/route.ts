import { NextResponse } from "next/server";
import { sameOrigin } from "@/lib/auth";
export async function POST(req: Request) {
  if (!sameOrigin(req))
    return NextResponse.json({ error: "Prohibido" }, { status: 403 });
  const res = NextResponse.json({ ok: true });
  res.cookies.delete("eira_session");
  return res;
}
