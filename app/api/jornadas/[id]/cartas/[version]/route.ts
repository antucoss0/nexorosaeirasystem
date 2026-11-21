import { actor, failure, pdfResponse } from "@/lib/phase3-api";
import { verifiedLetter, documentPDF } from "@/lib/phase3";
import { audit } from "@/lib/db";
export const dynamic = "force-dynamic";
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; version: string }> },
) {
  const { id, version } = await params;
  try {
    const user = await actor();
    const l = verifiedLetter(user, id, Number(version));
    const v = l.variables;
    const bytes = await documentPDF(`CARTA COMPROMISO · VERSIÓN ${l.version}`, [
      `Municipio: ${v.municipio}. Presidencia municipal: ${v.presidente}.`,
      `Persona enlace: ${v.enlace}. Sede: ${v.sede}. Fecha: ${v.fecha}.`,
      `Servicios: ${v.servicios.join(", ")}. Beneficiarias estimadas: ${v.beneficiarias}.`,
      ...l.clauses.map((s: string, i: number) => `${i + 1}. ${s}`),
      `Plantilla: ${l.template_version}. Autor: ${l.author}. Emisión: ${l.created_at}.`,
      `SHA-256: ${l.clauses_hash}`,
      "Firmas de conformidad: Municipio __________________  EIRA __________________",
    ]);
    audit(user, "jornadas", "descargar_carta", l.id, { version: l.version });
    return pdfResponse(bytes, `carta-v${l.version}.pdf`);
  } catch (e) {
    return failure(e);
  }
}
