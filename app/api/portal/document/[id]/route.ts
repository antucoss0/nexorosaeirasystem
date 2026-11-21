import { cookies } from "next/headers";
import { readFile } from "node:fs/promises";
import {
  documentCookie,
  validatePortalSession,
  markConsulted,
} from "@/lib/phase3";
import { pdfResponse, failure } from "@/lib/phase3-api";
export const dynamic = "force-dynamic";
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const session = (await cookies()).get(documentCookie(id))?.value;
    const { file } = validatePortalSession(session, id);
    const bytes = await readFile(file.path);
    markConsulted(session!, id);
    const response = pdfResponse(bytes, "documento-eira.pdf");
    if (new URL(req.url).searchParams.get("view") === "1")
      response.headers.set(
        "Content-Disposition",
        'inline; filename="documento-eira.pdf"',
      );
    return response;
  } catch (e) {
    return failure(e);
  }
}
