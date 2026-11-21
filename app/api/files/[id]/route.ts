import { open } from "@/lib/crypto";
import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { currentUser } from "@/lib/auth";
import { audit } from "@/lib/db";
import { authorizedFile } from "@/lib/phase3";
import { failure } from "@/lib/phase3-api";
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await currentUser();
  if (!user)
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  try {
    const file = authorizedFile(user, id);
    audit(user, "files", "descargar", id, {});
    return new NextResponse(new Uint8Array(open(await readFile(file.path))), {
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
