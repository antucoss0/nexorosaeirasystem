import { NextResponse } from "next/server";
import { currentUser, sameOrigin } from "@/lib/auth";
import { applyOperations, SyncError } from "@/lib/sync";
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user)
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!sameOrigin(req))
    return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  try {
    const body = await req.json();
    if (
      !Array.isArray(body.ops) ||
      body.ops.length > 100 ||
      JSON.stringify(body).length > 1000000
    )
      throw new SyncError("Lote inválido");
    return NextResponse.json(applyOperations(user, body.ops));
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof SyncError ? error.message : "Solicitud inválida",
      },
      { status: error instanceof SyncError ? error.status : 400 },
    );
  }
}
