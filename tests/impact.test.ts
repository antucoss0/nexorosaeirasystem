import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  autoMap,
  parseCSV,
  isoDate,
  normalizeRow,
  quality,
  identityCandidates,
  identityIssues,
  csvCell,
} from "../lib/impact-model";
import type { User } from "../lib/rbac";
test("XLSX admite fechas, rechaza libros vacíos y limita el tamaño descomprimido", async () => {
  const { default: ExcelJS } = await import("exceljs");
  const { readWorkbook, validateWorkbookBudget } = await import(
    "../lib/impact-xlsx"
  );
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Datos");
  sheet.addRow(["nombre", "fecha_nacimiento"]);
  sheet.addRow(["Persona sintética", new Date("1980-03-12T00:00:00Z")]);
  const bytes = Buffer.from(await workbook.xlsx.writeBuffer());
  assert.equal(
    (await readWorkbook(bytes)).rows[0].fecha_nacimiento,
    "1980-03-12",
  );
  assert.throws(() => validateWorkbookBudget(Buffer.from("no es un ZIP")));
  const oversized = Buffer.from(bytes);
  const end = oversized.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const central = oversized.readUInt32LE(end + 16);
  oversized.writeUInt32LE(21 * 1024 * 1024, central + 24);
  assert.throws(() => validateWorkbookBudget(oversized), /20 MB/);
  const empty = new ExcelJS.Workbook();
  await assert.rejects(
    readWorkbook(Buffer.from(await empty.xlsx.writeBuffer())),
    /vacío/,
  );
});
test("automapeo usa sinónimos, acentos y encabezados distintos sin reutilizar columnas", () => {
  const a = autoMap([
    "Nombre de beneficiaria",
    "Nacimiento",
    "Celular",
    "Localidad",
    "Servicio otorgado",
    "Fecha visita",
  ]);
  assert.equal(a.nombre, "Nombre de beneficiaria");
  assert.equal(a.fecha, "Fecha visita");
  assert.equal(a.fecha_nacimiento, "Nacimiento");
  assert.equal(a.tipo_servicio, "Servicio otorgado");
  const b = autoMap([
    "paciente",
    "fecha_nac",
    "telefono_contacto",
    "municipio_atencion",
    "estudio",
    "fecha_estudio",
  ]);
  assert.equal(b.nombre, "paciente");
  assert.equal(b.fecha_nacimiento, "fecha_nac");
  assert.equal(b.fecha, "fecha_estudio");
  assert.equal(b.tipo_servicio, "estudio");
  assert.equal(new Set(Object.values(b)).size, Object.values(b).length);
  assert.deepEqual(autoMap([]), {});
});
test("CSV admite comillas, saltos, BOM y separador punto y coma; rechaza archivos ambiguos", () => {
  const r = parseCSV(
    '\uFEFFnombre;municipio\r\n"Ana; María";"Tuxpan"\r\n"Luz\nRosa";Gómez Farías',
  );
  assert.equal(r.rows[0].nombre, "Ana; María");
  assert.equal(r.rows[1].nombre, "Luz\nRosa");
  assert.throws(() => parseCSV("a,a\n1,2"));
  assert.throws(() => parseCSV('a,b\n"sin cerrar'));
  assert.throws(() => parseCSV(""));
  assert.ok(csvCell('=HYPERLINK("evil")').startsWith("\"'"));
});
const good = {
  nombre: "Persona Sintética Importada",
  fecha_nacimiento: "1980-03-12",
  telefono: "3411234567",
  curp: "",
  municipio: "Tuxpan",
  programa: "Prueba de impacto",
  categoria: "Atención",
  tipo_servicio: "Orientación",
  fecha: "2026-01-10",
  cantidad: "1",
  unidad: "registro",
  fuente: "Fuente A",
};
test("reglas: fechas imposibles, rangos, teléfono, CURP, cantidad, categorías y requeridos", () => {
  assert.equal(isoDate("12/03/1980"), "1980-03-12");
  assert.equal(isoDate("2026-02-30"), "");
  assert.deepEqual(quality(good, "2026-11-21"), []);
  const rules = quality(
    {
      ...good,
      nombre: "",
      fecha_nacimiento: "1980-02-31",
      fecha: "2999-01-01",
      telefono: "123",
      curp: "MALA",
      cantidad: "-2",
      categoria: "Paciente",
    },
    "2026-11-21",
  ).map((a) => a.rule);
  for (const rule of [
    "requerido_nombre",
    "formato_fecha_nacimiento",
    "rango_fecha",
    "formato_telefono",
    "formato_curp",
    "rango_cantidad",
    "categoria_invalida",
  ])
    assert.ok(rules.includes(rule));
  assert.ok(
    quality({ ...good, cantidad: "NaN" }).some(
      (a) => a.rule === "rango_cantidad",
    ),
  );
  const mapped = normalizeRow(
    { Persona: " Ana ", Nacimiento: "12/03/1980" },
    { nombre: "Persona", fecha_nacimiento: "Nacimiento" },
    good,
  );
  assert.equal(mapped.nombre, "Ana");
  assert.equal(mapped.fecha_nacimiento, "1980-03-12");
});
test("matching de importaciones detecta discrepancias y no decide identidad automáticamente", () => {
  const matches = identityCandidates(good, [
    {
      ...good,
      id: "EXISTENTE",
      municipio: "Otro municipio",
      fecha_nacimiento: "1981-03-12",
    },
  ]);
  assert.equal(matches[0].id, "EXISTENTE");
  assert.ok(
    identityIssues(good, matches).some(
      (a) => a.rule === "discrepancia_fecha_nacimiento",
    ),
  );
  assert.ok(
    identityIssues(good, matches).some(
      (a) => a.rule === "discrepancia_municipio",
    ),
  );
  assert.deepEqual(identityCandidates(good, []), []);
});
test("consolidación trazable, dos fuentes solapadas, conteo único, permisos y exportación", async (t) => {
  process.env.DATA_DIR = mkdtempSync(join(process.cwd(), "data-test-"));
  const { db } = await import("../lib/db");
  const s = await import("../lib/impact");
  const admin: User = {
    id: "admin",
    email: "admin@eira.mx",
    nombre: "Admin",
    role: "admin",
    municipio: null,
  };
  const municipal: User = {
    ...admin,
    id: "municipio",
    role: "municipio",
    municipio: "Tuxpan",
  };
  t.after(() => {
    db.close();
    rmSync(process.env.DATA_DIR!, { recursive: true, force: true });
  });
  const base = Object.fromEntries(Object.keys(good).map((k) => [k, k]));
  const create = (source: string, rows: any[]) => {
    const b = s.createBatch(
      admin,
      source,
      Object.keys(good),
      rows,
      "hash-" + source,
      base,
    );
    return s.mapBatch(admin, b.id, base, {});
  };
  let a = create("Fuente A", [
    good,
    {
      ...good,
      nombre: "Otra Persona Sintética",
      fecha_nacimiento: "1970-07-10",
      tipo_servicio: "Otro servicio",
    },
  ]);
  assert.throws(() => s.consolidate(admin, a.id), /decisiones/);
  assert.throws(() =>
    s.adjustRow(admin, a.rows[0].id, { telefono: "3410000000" }, ""),
  );
  a = s.adjustRow(
    admin,
    a.rows[0].id,
    { telefono: "3410000000" },
    "Verificación en fuente original",
  );
  s.decideRows(
    admin,
    a.id,
    a.rows.map((r: any) => ({
      id: r.id,
      person: "new",
      rules: Object.fromEntries(
        r.anomalies.map((x: any) => [x.rule, "aceptar"]),
      ),
    })),
  );
  a = s.consolidate(admin, a.id);
  const first = a.rows[0].person_id;
  assert.ok(first.startsWith("IMP-PER-"));
  assert.equal(s.consolidate(admin, a.id).state, "consolidated");
  assert.throws(() =>
    s.adjustRow(admin, a.rows[0].id, { nombre: "Otro" }, "Cambio tardío"),
  );
  let b = create("Fuente B", [
    {
      ...good,
      telefono: "3410000000",
      tipo_servicio: "Seguimiento",
      fuente: "Fuente B",
    },
    { ...good, telefono: "3410000000", fuente: "Fuente B" },
  ]);
  assert.ok(b.rows[0].matches.some((m: any) => m.id === first));
  s.decideRows(
    admin,
    b.id,
    b.rows.map((r: any) => ({
      id: r.id,
      person: first,
      rules: Object.fromEntries(
        r.anomalies.map((x: any) => [x.rule, "aceptar"]),
      ),
    })),
  );
  s.consolidate(admin, b.id);
  const report = s.impactReport(admin, { programa: good.programa });
  assert.equal(report.personas, 2);
  assert.equal(report.total, 3);
  assert.equal(report.counts["Atención"], 3);
  assert.equal(report.ratio, 1.5);
  assert.equal(report.duplicatesOmitted, 1);
  assert.equal(report.adjustments.length, 1);
  assert.equal(s.impactReport(admin, { programa: "No existe" }).personas, 0);
  assert.equal(s.impactReport(admin, { programa: "No existe" }).ratio, 0);
  assert.throws(() => s.impactReport(admin, { desde: "2026-02-30" }));
  assert.throws(
    () => s.createBatch(municipal, "x", [], [], "", {}),
    (e: any) => e.status === 403,
  );
  assert.throws(
    () => s.impactReport(municipal),
    (e: any) => e.status === 403,
  );
  assert.throws(
    () =>
      db
        .prepare("UPDATE import_rows SET included=0 WHERE id=?")
        .run(a.rows[0].id),
    /immutable/,
  );
  const csv = (
    await s.exportImpact(admin, { programa: good.programa }, "csv")
  ).toString();
  assert.ok(csv.includes("ANEXO"));
  assert.ok(csv.includes("Verificación en fuente original"));
  assert.ok(csv.includes("admin"));
  const pdf = await s.exportImpact(admin, {}, "pdf");
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  const aggregate = s.aggregate(
    [
      { ...good, person_id: "A", native: true },
      { ...good, person_id: "A", native: true },
      {
        ...good,
        person_id: "A",
        native: false,
        cantidad: "1.00",
        fuente: "Otra",
        import_row_id: "R",
      },
    ],
    ["A"],
  );
  assert.equal(
    aggregate.total,
    2,
    "Dos actividades nativas legítimas no se colapsan",
  );
  assert.equal(aggregate.personas, 1);
  assert.ok(aggregate.records[0].sources.includes("Otra"));
  const empty = s.aggregate([], []);
  assert.equal(empty.total, 0);
  assert.equal(empty.ratio, 0);
});
