import { seal } from "@/lib/crypto";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { currentUser, sameOrigin } from "@/lib/auth";
import { scopedJornada, transitionRequirement } from "@/lib/phase3";
import { failure } from "@/lib/phase3-api";
import { db, filesDir, audit } from "@/lib/db";
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user)
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (
    !["laboratorio", "municipio", "admin"].includes(user.role) ||
    !sameOrigin(req)
  )
    return NextResponse.json(
      { error: "No tienes permiso para cargar archivos" },
      { status: 403 },
    );
  let path = "";
  try {
    const data = await req.formData();
    const file = data.get("file");
    const jornadaId = String(data.get("jornadaId") || ""),
      requirementKey = String(data.get("requirementKey") || "");
    if (jornadaId) {
      if (!["admin", "municipio"].includes(user.role))
        throw Error("Carga no autorizada");
      const j = scopedJornada(user, jornadaId);
      if (!j.requisitos?.some((r: any) => r.clave === requirementKey))
        throw Error("Requisito no encontrado");
    } else if (user.role !== "laboratorio")
      throw Error("Indica la jornada y requisito");
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
    const pdf =
      file.type === "application/pdf" &&
      bytes.subarray(0, 5).toString() === "%PDF-";
    const png =
      file.type === "image/png" &&
      bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const jpg =
      file.type === "image/jpeg" &&
      bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]));
    if (!(pdf || (jornadaId && (png || jpg))))
      return NextResponse.json(
        {
          error:
            "Archivo inválido: utiliza PDF o, para requisitos, imagen PNG/JPEG; el tipo y contenido deben coincidir",
        },
        { status: 400 },
      );
    const id = randomUUID();
    path = join(filesDir, id + (pdf ? ".pdf" : png ? ".png" : ".jpg"));
    await writeFile(path, seal(bytes), { flag: "wx" });
    db.transaction(() => {
      db.prepare("INSERT INTO files VALUES (?,?,?,?,?,?,?,?)").run(
        id,
        file.name.slice(0, 200),
        path,
        file.type,
        bytes.length,
        1,
        new Date().toISOString(),
        user.id,
      );
      audit(user, "files", "create", id, { filename: file.name });
      db.prepare("INSERT INTO file_links VALUES (?,?,?,?,?,?)").run(
        id,
        jornadaId ? "jornada" : "pap",
        jornadaId || null,
        requirementKey || null,
        null,
        user.id,
      );
      if (jornadaId)
        transitionRequirement(
          user,
          jornadaId,
          requirementKey,
          "recibido",
          "",
          id,
        );
    })();
    return NextResponse.json({ id, filename: file.name }, { status: 201 });
  } catch (e) {
    if (path) await unlink(path).catch(() => {});
    return failure(e);
  }
}
