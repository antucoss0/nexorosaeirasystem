import { NextResponse } from "next/server";
import { compareSync } from "bcryptjs";
import { db } from "@/lib/db";
import { signSession, sameOrigin } from "@/lib/auth";
export async function POST(req: Request) {
  if (!sameOrigin(req))
    return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  try {
    const { email, password } = await req.json();
    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      password.length > 200
    )
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    const user = db
      .prepare("SELECT * FROM users WHERE email=?")
      .get(email) as any;
    if (!user || !compareSync(password, user.password_hash))
      return NextResponse.json(
        { error: "Credenciales incorrectas" },
        { status: 401 },
      );
    const { password_hash, ...safe } = user;
    const response = NextResponse.json({ user: safe });
    response.cookies.set("eira_session", await signSession(safe), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.COOKIE_SECURE === "true",
      path: "/",
      maxAge: 43200,
    });
    return response;
  } catch {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }
}
