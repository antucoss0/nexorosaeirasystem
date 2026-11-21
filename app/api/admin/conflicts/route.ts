import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { db, decode } from "@/lib/db";
import { candidates } from "@/lib/matching";
export const dynamic = "force-dynamic";
export async function GET() {
  const user = await currentUser();
  if (!user)
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (user.role !== "admin")
    return NextResponse.json({ error: "Prohibido" }, { status: 403 });
  const conflicts = db
    .prepare(
      "SELECT c.* FROM conflicts c LEFT JOIN conflict_resolutions r ON c.id=r.conflict_id WHERE r.conflict_id IS NULL ORDER BY c.created_at DESC",
    )
    .all()
    .map((r: any) => ({
      ...r,
      server: decode(
        db.prepare(`SELECT * FROM ${r.table_name} WHERE id=?`).get(r.entity_id),
      ),
      client: JSON.parse(r.client_patch),
    }));
  const patients = db
    .prepare("SELECT * FROM patients")
    .all()
    .map(decode)
    .filter((p) => !p.merged_into);
  const dismissed = new Set(
    db
      .prepare(
        "SELECT data FROM decisions WHERE json_extract(data,'$.action')='dismiss_duplicate'",
      )
      .all()
      .map((r: any) => {
        const d = JSON.parse(r.data);
        return [d.patientId, d.otherId].sort().join("|");
      }),
  );
  const pairs: any[] = [];
  for (let i = 0; i < patients.length; i++)
    for (const c of candidates(patients[i], patients.slice(i + 1)))
      if (!dismissed.has([patients[i].id, c.patient.id].sort().join("|")))
        pairs.push({
          a: patients[i],
          b: c.patient,
          score: c.score,
          reasons: c.reasons,
        });
  return NextResponse.json(
    { conflicts, pairs },
    { headers: { "Cache-Control": "no-store" } },
  );
}
