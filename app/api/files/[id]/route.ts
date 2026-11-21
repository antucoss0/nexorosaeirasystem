import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { currentUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const user = await currentUser();
  if (!user)
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!can(user.role, "clinical_read"))
    return NextResponse.json({ error: "Prohibido" }, { status: 403 });
  const file = db
    .prepare("SELECT * FROM files WHERE id=?")
    .get(params.id) as any;
  if (!file)
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return new NextResponse(await readFile(file.path), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="resultado.pdf"',
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
