import { NextResponse } from "next/server";
import { currentUser, sameOrigin } from "./auth";
import { SyncError } from "./sync";
export async function actor(req?: Request) {
  const user = await currentUser();
  if (!user) throw new SyncError("No autenticado", 401);
  if (req && !sameOrigin(req)) throw new SyncError("Origen no permitido", 403);
  return user;
}
export function failure(e: unknown) {
  return NextResponse.json(
    { error: e instanceof SyncError ? e.message : "Solicitud inválida" },
    { status: e instanceof SyncError ? e.status : 400 },
  );
}
export function pdfResponse(bytes: Buffer, name: string) {
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}
