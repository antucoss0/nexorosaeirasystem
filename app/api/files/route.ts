import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { currentUser, sameOrigin } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db, filesDir, audit } from "@/lib/db";
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user)
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!can(user.role, "upload_pdf") || !sameOrigin(req))
    return NextResponse.json(
      { error: "Solo laboratorio carga PDFs" },
      { status: 403 },
    );
  let path = "";
  try {
    const data = await req.formData();
    const file = data.get("file");
    if (
      !(file instanceof File) ||
      file.size > 10 * 1024 * 1024 ||
      file.size < 5
    )
      return NextResponse.json(
        { error: "PDF requerido, máximo 10 MB" },
        { status: 400 },
      );
    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.subarray(0, 5).toString() !== "%PDF-")
      return NextResponse.json(
        { error: "Archivo PDF inválido" },
        { status: 400 },
      );
    const id = randomUUID();
    path = join(filesDir, id + ".pdf");
    await writeFile(path, bytes, { flag: "wx" });
    db.transaction(() => {
      db.prepare("INSERT INTO files VALUES (?,?,?,?,?,?,?,?)").run(
        id,
        file.name.slice(0, 200),
        path,
        "application/pdf",
        bytes.length,
        1,
        new Date().toISOString(),
        user.id,
      );
      audit(user, "files", "create", id, { filename: file.name });
    })();
    return NextResponse.json({ id, filename: file.name }, { status: 201 });
  } catch {
    if (path) await unlink(path).catch(() => {});
    return NextResponse.json(
      { error: "No se pudo guardar el archivo" },
      { status: 400 },
    );
  }
}
