import { NextResponse } from "next/server";
import { currentUser, sameOrigin } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { applyOperations, SyncError } from "@/lib/sync";
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user)
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!can(user.role, "approve_requirements") || !sameOrigin(req))
    return NextResponse.json(
      { error: "Solo administración aprueba requisitos" },
      { status: 403 },
    );
  try {
    const op = await req.json();
    if (op.table !== "jornadas" || op.type !== "update")
      throw new SyncError("Se requiere una actualización de jornada");
    return NextResponse.json(applyOperations(user, [op]));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error" },
      { status: e instanceof SyncError ? e.status : 400 },
    );
  }
}
