import { NextResponse } from "next/server";
import { actor, failure, pdfResponse } from "@/lib/phase3-api";
import {
  ensurePapSeed,
  listPAP,
  associatePAP,
  papAction,
  requireRole,
  documentPDF,
} from "@/lib/phase3";
import { db, decode, audit } from "@/lib/db";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const user = await actor();
    requireRole(user, ["admin", "laboratorio", "consulta_clinica"]);
    await ensurePapSeed();
    const results = listPAP(user);
    audit(user, "pap", "consultar_panel", user.id, {
      cantidad: results.length,
    });
    return NextResponse.json(
      {
        results,
        patients: db
          .prepare("SELECT * FROM patients")
          .all()
          .map(decode)
          .filter((p) => !p.merged_into),
        notifications:
          user.role === "admin"
            ? db
                .prepare(
                  "SELECT * FROM notifications WHERE kind='document' ORDER BY created_at DESC LIMIT 30",
                )
                .all()
            : [],
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    const user = await actor(req),
      body = await req.json();
    if (body.action === "synthetic") {
      requireRole(user, ["laboratorio"]);
      const bytes = await documentPDF("DOCUMENTO SINTÉTICO · DEMOSTRACIÓN", [
        "Archivo ficticio de EIRA para probar el circuito de entrega. No corresponde a una persona real. Sin validez clínica.",
      ]);
      audit(user, "pap", "generar_pdf_sintetico", user.id, {});
      return pdfResponse(bytes, "documento-sintetico.pdf");
    }
    const result =
      body.action === "associate"
        ? associatePAP(user, body)
        : papAction(
            user,
            body,
            process.env.APP_ORIGIN || new URL(req.url).origin,
          );
    return NextResponse.json(result);
  } catch (e) {
    return failure(e);
  }
}
