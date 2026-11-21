import { NextResponse } from "next/server";
import { actor, failure } from "@/lib/phase3-api";
import {
  requireRole,
  listJornadas,
  listPAP,
  ensurePapSeed,
} from "@/lib/phase3";
import { impactReport } from "@/lib/impact";
import { db } from "@/lib/db";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const user = await actor();
    requireRole(user, ["admin"]);
    await ensurePapSeed();
    return NextResponse.json(
      {
        personas: impactReport(user).personas,
        criticos: listJornadas(user).reduce(
          (n, j) => n + j.traffic.critical,
          0,
        ),
        pap_no_leidos: listPAP(user).filter((a) => a.unread).length,
        conflictos: (
          db
            .prepare(
              "SELECT COUNT(*) n FROM conflicts c LEFT JOIN conflict_resolutions r ON c.id=r.conflict_id WHERE r.conflict_id IS NULL",
            )
            .get() as any
        ).n,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
