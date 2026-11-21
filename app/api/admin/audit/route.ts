import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const user = await currentUser();
  if (!user)
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (user.role !== "admin")
    return NextResponse.json({ error: "Prohibido" }, { status: 403 });
  const q = new URL(req.url).searchParams;
  const where: string[] = [];
  const params: string[] = [];
  for (const k of ["usuario", "rol", "modulo", "accion", "entidad_id"])
    if (q.get(k)) {
      where.push(`${k} LIKE ? ESCAPE '\\'`);
      params.push("%" + q.get(k)!.replace(/[\\%_]/g, "\\$&") + "%");
    }
  if (q.get("fecha")) {
    where.push("substr(timestamp,1,10)=?");
    params.push(q.get("fecha")!);
  }
  const rows = db
    .prepare(
      `SELECT * FROM audit_logs ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY id DESC`,
    )
    .all(...params) as any[];
  if (q.get("format") === "csv") {
    const keys = [
      "id",
      "timestamp",
      "usuario",
      "rol",
      "modulo",
      "accion",
      "entidad_id",
      "detalle",
    ];
    const cell = (v: unknown) =>
      '"' +
      String(v ?? "")
        .replace(/^[=+@-]/, "'$&")
        .replace(/"/g, '""') +
      '"';
    return new NextResponse(
      "\uFEFF" +
        [
          keys.join(","),
          ...rows.map((r) => keys.map((k) => cell(r[k])).join(",")),
        ].join("\r\n"),
      {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="bitacora-eira.csv"',
          "Cache-Control": "no-store",
        },
      },
    );
  }
  return NextResponse.json(
    { rows },
    { headers: { "Cache-Control": "no-store" } },
  );
}
