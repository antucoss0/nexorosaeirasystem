import { NextResponse } from "next/server";
import { sameOrigin } from "@/lib/auth";
import { portalAvailable, verifyPortal, documentCookie } from "@/lib/phase3";
import { failure } from "@/lib/phase3-api";
import { audit } from "@/lib/db";
import { hash } from "@/lib/phase3";
export const dynamic = "force-dynamic";
export async function GET(
  _req: Request,
  { params }: { params: { token: string } },
) {
  audit(
    { id: "portal", role: "paciente" },
    "portal",
    "abrir_enlace",
    hash(params.token),
    {},
  );
  return NextResponse.json(
    { available: portalAvailable(params.token) },
    {
      headers: {
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    },
  );
}
export async function POST(
  req: Request,
  { params }: { params: { token: string } },
) {
  try {
    if (!sameOrigin(req))
      return NextResponse.json(
        { error: "Origen no permitido" },
        { status: 403 },
      );
    const body = await req.json();
    const result = verifyPortal(params.token, body.method, body.value);
    if (!result.ok)
      return NextResponse.json(
        { error: result.error },
        { status: result.status, headers: { "Cache-Control": "no-store" } },
      );
    const path = "/api/portal/document/" + result.documentId;
    const response = NextResponse.json(
      { documentId: result.documentId, downloadUrl: path },
      { headers: { "Cache-Control": "no-store" } },
    );
    response.cookies.set(documentCookie(result.documentId), result.session, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.COOKIE_SECURE === "true",
      path,
      maxAge: 600,
    });
    return response;
  } catch (e) {
    return failure(e);
  }
}
