import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { actor, failure, pdfResponse } from "@/lib/phase3-api";
import { requireRole } from "@/lib/phase3";
import { audit } from "@/lib/db";
import {
  listBatches,
  readBatch,
  createBatch,
  mapBatch,
  adjustRow,
  decideRows,
  consolidate,
  impactReport,
  exportImpact,
  type Filters,
} from "@/lib/impact";
import { autoMap, parseCSV, tabular } from "@/lib/impact-model";
import { readWorkbook } from "@/lib/impact-xlsx";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    const user = await actor();
    requireRole(user, ["admin"]);
    const p = new URL(req.url).searchParams;
    if (p.has("batch"))
      return NextResponse.json(readBatch(user, p.get("batch")!), {
        headers: { "Cache-Control": "no-store" },
      });
    const filters = Object.fromEntries(
      ["programa", "desde", "hasta", "municipio", "tipo_servicio", "fuente"]
        .filter((k) => p.get(k))
        .map((k) => [k, p.get(k)!]),
    ) as Filters;
    const format = p.get("format");
    if (format) {
      if (!["csv", "pdf"].includes(format)) throw Error("Formato inválido");
      const bytes = await exportImpact(user, filters, format);
      if (format === "pdf") return pdfResponse(bytes, "informe-impacto.pdf");
      return new NextResponse(new Uint8Array(bytes), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="informe-impacto.csv"',
          "Cache-Control": "private, no-store",
        },
      });
    }
    return NextResponse.json(
      { report: impactReport(user, filters), batches: listBatches(user) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    const user = await actor(req);
    requireRole(user, ["admin"]);
    if (req.headers.get("content-type")?.includes("multipart/form-data")) {
      const fd = await req.formData();
      const f = fd.get("file");
      if (!(f instanceof File) || !f.size || f.size > 5 * 1024 * 1024)
        throw Error("Archivo vacío o mayor de 5 MB");
      const bytes = Buffer.from(await f.arrayBuffer());
      let parsed;
      if (/\.csv$/i.test(f.name)) parsed = parseCSV(bytes.toString("utf8"));
      else if (/\.xlsx$/i.test(f.name)) {
        parsed = await readWorkbook(bytes);
      } else throw Error("Solo CSV o XLSX");
      return NextResponse.json(
        createBatch(
          user,
          String(fd.get("source") || f.name),
          parsed.headers,
          parsed.rows,
          createHash("sha256").update(bytes).digest("hex"),
          autoMap(parsed.headers),
        ),
      );
    }
    const body = await req.json();
    switch (body.action) {
      case "sample": {
        if (![1, 2].includes(body.sample)) throw Error("Fuente inválida");
        const bytes = await readFile(
          join(
            process.cwd(),
            "public",
            "samples",
            body.sample === 1 ? "programa_mama.csv" : "programa_cervix.csv",
          ),
        );
        const parsed = parseCSV(bytes.toString("utf8"));
        return NextResponse.json(
          createBatch(
            user,
            "Fuente sintética " + body.sample,
            parsed.headers,
            parsed.rows,
            createHash("sha256").update(bytes).digest("hex"),
            autoMap(parsed.headers),
          ),
        );
      }
      case "map":
        return NextResponse.json(
          mapBatch(user, body.id, body.mapping, body.defaults),
        );
      case "adjust":
        return NextResponse.json(
          adjustRow(user, body.rowId, body.patch, body.reason),
        );
      case "decide":
        return NextResponse.json(decideRows(user, body.id, body.decisions));
      case "consolidate":
        return NextResponse.json(consolidate(user, body.id));
      default:
        throw Error("Acción inválida");
    }
  } catch (e) {
    return failure(e);
  }
}
