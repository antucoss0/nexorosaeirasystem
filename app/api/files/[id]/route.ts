import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { currentUser } from "@/lib/auth";
import { audit } from "@/lib/db";
import { authorizedFile } from "@/lib/phase3";
import { failure } from "@/lib/phase3-api";
export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const user = await currentUser();
  if (!user)
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  try {
    const file = authorizedFile(user, params.id);
    audit(user, "files", "descargar", params.id, {});
    return new NextResponse(await readFile(file.path), {
      headers: {
        "Content-Type": file.mime,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(file.filename)}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
