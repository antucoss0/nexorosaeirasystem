import { randomUUID, createHash } from "node:crypto";
import { db, decode, audit } from "./db";
import type { User } from "./rbac";
import { requireRole, documentPDF } from "./phase3";
import { SyncError } from "./sync";
import {
  fields,
  normalizeRow,
  quality,
  identityCandidates,
  identityIssues,
  isoDate,
  csvCell,
  categories,
} from "./impact-model";
db.exec(`CREATE TABLE IF NOT EXISTS import_batches(id TEXT PRIMARY KEY,source TEXT NOT NULL,headers TEXT NOT NULL,mapping TEXT NOT NULL,defaults TEXT NOT NULL,fingerprint TEXT NOT NULL,state TEXT NOT NULL,created_at TEXT NOT NULL,author TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS import_rows(id TEXT PRIMARY KEY,batch_id TEXT NOT NULL REFERENCES import_batches(id),row_number INTEGER NOT NULL,raw TEXT NOT NULL,data TEXT NOT NULL,anomalies TEXT NOT NULL,matches TEXT NOT NULL,decisions TEXT NOT NULL,person_choice TEXT,person_id TEXT,included INTEGER NOT NULL DEFAULT 0,UNIQUE(batch_id,row_number));
CREATE TABLE IF NOT EXISTS import_people(id TEXT PRIMARY KEY,data TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS import_mappings(source TEXT PRIMARY KEY,mapping TEXT NOT NULL,defaults TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TRIGGER IF NOT EXISTS consolidated_rows_no_update BEFORE UPDATE ON import_rows WHEN (SELECT state FROM import_batches WHERE id=OLD.batch_id)='consolidated' BEGIN SELECT RAISE(ABORT,'immutable consolidated import'); END;
CREATE TRIGGER IF NOT EXISTS consolidated_rows_no_delete BEFORE DELETE ON import_rows WHEN (SELECT state FROM import_batches WHERE id=OLD.batch_id)='consolidated' BEGIN SELECT RAISE(ABORT,'immutable consolidated import'); END;`);
function text(s: unknown, max = 200) {
  if (typeof s !== "string" || !s.trim() || s.length > max)
    throw new SyncError("Texto requerido o demasiado largo");
  return s.trim();
}
function batch(id: string) {
  const b = db
    .prepare("SELECT * FROM import_batches WHERE id=?")
    .get(id) as any;
  if (!b) throw new SyncError("Lote no encontrado", 404);
  return {
    ...b,
    headers: JSON.parse(b.headers),
    mapping: JSON.parse(b.mapping),
    defaults: JSON.parse(b.defaults),
  };
}
function row(id: string) {
  const r = db.prepare("SELECT * FROM import_rows WHERE id=?").get(id) as any;
  if (!r) throw new SyncError("Fila no encontrada", 404);
  return {
    ...r,
    raw: JSON.parse(r.raw),
    data: JSON.parse(r.data),
    anomalies: JSON.parse(r.anomalies),
    matches: JSON.parse(r.matches),
    decisions: JSON.parse(r.decisions),
  };
}
function people() {
  return [
    ...db
      .prepare("SELECT * FROM patients")
      .all()
      .map(decode)
      .filter((p) => !p.merged_into),
    ...db
      .prepare("SELECT * FROM import_people")
      .all()
      .map((p: any) => ({ id: p.id, ...JSON.parse(p.data) })),
  ];
}
export function readBatch(user: User, id: string) {
  requireRole(user, ["admin"]);
  return {
    ...batch(id),
    rows: db
      .prepare(
        "SELECT id FROM import_rows WHERE batch_id=? ORDER BY row_number",
      )
      .all(id)
      .map((r: any) => row(r.id)),
  };
}
export function listBatches(user: User) {
  requireRole(user, ["admin"]);
  return db
    .prepare(
      "SELECT id,source,state,created_at FROM import_batches ORDER BY created_at DESC LIMIT 50",
    )
    .all();
}
export function createBatch(
  user: User,
  source: string,
  headers: string[],
  rows: Record<string, string>[],
  fingerprint: string,
  suggestion: any,
) {
  requireRole(user, ["admin"]);
  text(source);
  if (!rows.length || rows.length > 2000)
    throw new SyncError("Se requieren entre 1 y 2000 filas");
  return db
    .transaction(() => {
      const stored = db
        .prepare("SELECT * FROM import_mappings WHERE source=?")
        .get(source) as any;
      const id = randomUUID();
      const defaults = stored
        ? JSON.parse(stored.defaults)
        : {
            programa: "Comunitario",
            categoria: "Atención",
            cantidad: "1",
            unidad: "registro",
            fuente: source,
          };
      const mapping = stored
        ? Object.fromEntries(
            Object.entries(JSON.parse(stored.mapping)).filter(([, h]) =>
              headers.includes(String(h)),
            ),
          )
        : suggestion;
      db.prepare("INSERT INTO import_batches VALUES (?,?,?,?,?,?,?,?,?)").run(
        id,
        source,
        JSON.stringify(headers),
        JSON.stringify(mapping),
        JSON.stringify(defaults),
        fingerprint,
        "mapping",
        new Date().toISOString(),
        user.id,
      );
      rows.forEach((raw, i) =>
        db
          .prepare("INSERT INTO import_rows VALUES (?,?,?,?,?,?,?,?,?,?,?)")
          .run(
            randomUUID(),
            id,
            i + 2,
            JSON.stringify(raw),
            "{}",
            "[]",
            "[]",
            "{}",
            null,
            null,
            0,
          ),
      );
      audit(user, "impacto", "cargar_fuente", id, {
        source,
        filas: rows.length,
        fingerprint,
      });
      return readBatch(user, id);
    })
    .immediate();
}
function analyze(id: string) {
  const known = people();
  for (const r of db
    .prepare("SELECT id FROM import_rows WHERE batch_id=? ORDER BY row_number")
    .all(id) as any[]) {
    const current = row(r.id);
    const matches = identityCandidates(current.data, known);
    const anomalies = [
      ...quality(current.data),
      ...identityIssues(current.data, matches),
    ];
    const old = current.decisions;
    const decisions = Object.fromEntries(
      anomalies.filter((a) => old[a.rule]).map((a) => [a.rule, old[a.rule]]),
    );
    db.prepare(
      "UPDATE import_rows SET anomalies=?,matches=?,decisions=? WHERE id=?",
    ).run(
      JSON.stringify(anomalies),
      JSON.stringify(matches),
      JSON.stringify(decisions),
      r.id,
    );
    known.push({ id: "ROW:" + r.id, ...current.data });
  }
}
export function mapBatch(user: User, id: string, mapping: any, defaults: any) {
  requireRole(user, ["admin"]);
  return db
    .transaction(() => {
      const b = batch(id);
      if (b.state === "consolidated")
        throw new SyncError("El lote consolidado es inmutable", 409);
      if (
        !mapping ||
        !defaults ||
        Object.keys(mapping).some((k) => !fields.includes(k)) ||
        Object.entries(mapping).some(([, h]) => h && !b.headers.includes(h)) ||
        Object.keys(defaults).some((k) => !fields.includes(k)) ||
        Object.values(defaults).some(
          (v) => typeof v !== "string" || v.length > 2000,
        )
      )
        throw new SyncError("Mapeo inválido");
      for (const r of db
        .prepare("SELECT id,raw FROM import_rows WHERE batch_id=?")
        .all(id) as any[])
        db.prepare(
          "UPDATE import_rows SET data=?,decisions=?,person_choice=NULL WHERE id=?",
        ).run(
          JSON.stringify(
            normalizeRow(JSON.parse(r.raw), mapping, {
              ...defaults,
              fuente: defaults.fuente || b.source,
            }),
          ),
          "{}",
          r.id,
        );
      db.prepare(
        "UPDATE import_batches SET mapping=?,defaults=?,state='quality' WHERE id=?",
      ).run(JSON.stringify(mapping), JSON.stringify(defaults), id);
      db.prepare(
        "INSERT INTO import_mappings VALUES (?,?,?,?) ON CONFLICT(source) DO UPDATE SET mapping=excluded.mapping,defaults=excluded.defaults,updated_at=excluded.updated_at",
      ).run(
        b.source,
        JSON.stringify(mapping),
        JSON.stringify(defaults),
        new Date().toISOString(),
      );
      analyze(id);
      audit(user, "impacto", "confirmar_mapeo", id, { mapping, defaults });
      return readBatch(user, id);
    })
    .immediate();
}
export function adjustRow(user: User, id: string, patch: any, reason: string) {
  requireRole(user, ["admin"]);
  return db
    .transaction(() => {
      const r = row(id),
        b = batch(r.batch_id);
      if (b.state !== "quality")
        throw new SyncError("Solo se ajusta durante revisión", 409);
      text(reason, 1000);
      if (
        !patch ||
        !Object.keys(patch).length ||
        Object.keys(patch).some((k) => !fields.includes(k)) ||
        Object.values(patch).some(
          (v) => typeof v !== "string" || v.length > 2000,
        )
      )
        throw new SyncError("Ajuste inválido");
      const after = { ...r.data, ...patch };
      for (const k of ["fecha", "fecha_nacimiento"])
        after[k] = isoDate(after[k]) || after[k];
      db.prepare(
        "UPDATE import_rows SET data=?,decisions=?,person_choice=NULL WHERE id=?",
      ).run(JSON.stringify(after), "{}", id);
      audit(user, "impacto", "ajuste_manual", id, {
        batch_id: b.id,
        fuente: b.source,
        fila: r.row_number,
        motivo: reason,
        antes: r.data,
        despues: after,
      });
      analyze(b.id);
      return readBatch(user, b.id);
    })
    .immediate();
}
export function decideRows(user: User, id: string, decisions: any[]) {
  requireRole(user, ["admin"]);
  if (!Array.isArray(decisions) || decisions.length > 2000)
    throw new SyncError("Decisiones inválidas");
  return db
    .transaction(() => {
      const b = batch(id);
      if (b.state !== "quality")
        throw new SyncError("El lote no está en revisión", 409);
      for (const d of decisions) {
        const r = row(d.id);
        if (r.batch_id !== id) throw new SyncError("Fila de otro lote", 403);
        if (
          !d.rules ||
          r.anomalies.some(
            (a: any) => !["aceptar", "excluir"].includes(d.rules[a.rule]),
          )
        )
          throw new SyncError(
            "Resuelve todas las anomalías: corregir requiere guardar un ajuste con motivo",
          );
        if (typeof d.person !== "string" || !d.person)
          throw new SyncError("Confirma una persona o selecciona excluir");
        if (
          d.person !== "new" &&
          d.person !== "exclude" &&
          !r.matches.some((m: any) => m.id === d.person)
        )
          throw new SyncError(
            "Identidad fuera de las propuestas; corrige los datos o crea una persona distinta",
          );
        db.prepare(
          "UPDATE import_rows SET decisions=?,person_choice=? WHERE id=?",
        ).run(JSON.stringify(d.rules), d.person, d.id);
        audit(user, "impacto", "decision_calidad", r.id, {
          batch_id: id,
          reglas: d.rules,
          persona: d.person,
        });
      }
      return readBatch(user, id);
    })
    .immediate();
}
export function consolidate(user: User, id: string) {
  requireRole(user, ["admin"]);
  return db
    .transaction(() => {
      const b = readBatch(user, id);
      if (b.state === "consolidated") return b;
      if (b.state !== "quality")
        throw new SyncError("Confirma el mapeo primero");
      const resolved = new Map<string, string>();
      for (const r of b.rows) {
        if (
          !r.person_choice ||
          r.anomalies.some(
            (a: any) => !["aceptar", "excluir"].includes(r.decisions[a.rule]),
          )
        )
          throw new SyncError(
            `Fila ${r.row_number}: faltan decisiones explícitas`,
          );
        if (
          r.person_choice === "exclude" ||
          Object.values(r.decisions).includes("excluir")
        )
          continue;
        let person = r.person_choice;
        if (person.startsWith("ROW:")) {
          person = resolved.get(person.slice(4));
          if (!person)
            throw new SyncError(
              `Fila ${r.row_number}: la fila vinculada fue excluida; elige otra identidad`,
            );
        } else if (person === "new") {
          person = "IMP-PER-" + randomUUID();
          db.prepare("INSERT INTO import_people VALUES (?,?,?)").run(
            person,
            JSON.stringify(r.data),
            new Date().toISOString(),
          );
        } else if (!people().some((p) => p.id === person))
          throw new SyncError(
            "La identidad cambió; revisa antes de consolidar",
            409,
          );
        resolved.set(r.id, person);
        db.prepare(
          "UPDATE import_rows SET person_id=?,included=1 WHERE id=?",
        ).run(person, r.id);
      }
      db.prepare(
        "UPDATE import_batches SET state='consolidated' WHERE id=?",
      ).run(id);
      audit(user, "impacto", "consolidar", id, {
        incluidas: resolved.size,
        excluidas: b.rows.length - resolved.size,
      });
      return readBatch(user, id);
    })
    .immediate();
}
export type Filters = {
  programa?: string;
  desde?: string;
  hasta?: string;
  municipio?: string;
  tipo_servicio?: string;
  fuente?: string;
};
const eventKey = (r: any) =>
  createHash("sha256")
    .update(
      JSON.stringify(
        [
          r.person_id,
          r.fecha,
          r.categoria,
          r.tipo_servicio,
          r.programa,
          Number.isFinite(Number(r.cantidad)) ? Number(r.cantidad) : r.cantidad,
          r.unidad,
          r.municipio,
        ].map((v) =>
          String(v ?? "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/\s+/g, " ")
            .trim(),
        ),
      ),
    )
    .digest("hex");
export function aggregate(
  activities: any[],
  allPeople: string[],
  filters: Filters = {},
) {
  const native = activities.filter((a) => a.native),
    imported = activities.filter((a) => !a.native);
  const unique = [
    ...native.map((a) => ({
      ...a,
      sources: [a.fuente],
      import_ids: [] as string[],
    })),
  ];
  const byKey = new Map<string, any>();
  unique.forEach((a) => {
    if (!byKey.has(eventKey(a))) byKey.set(eventKey(a), a);
  });
  for (const a of imported) {
    const key = eventKey(a);
    const prior = byKey.get(key);
    if (prior) {
      prior.sources = [...new Set([...prior.sources, a.fuente])];
      if (a.import_row_id) prior.import_ids.push(a.import_row_id);
    } else {
      const item = {
        ...a,
        sources: [a.fuente],
        import_ids: a.import_row_id ? [a.import_row_id] : [],
      };
      byKey.set(key, item);
      unique.push(item);
    }
  }
  const selected = unique.filter(
    (a) =>
      (!filters.programa || a.programa === filters.programa) &&
      (!filters.municipio || a.municipio === filters.municipio) &&
      (!filters.tipo_servicio || a.tipo_servicio === filters.tipo_servicio) &&
      (!filters.fuente || a.sources.includes(filters.fuente)) &&
      (!filters.desde || (isoDate(a.fecha) && a.fecha >= filters.desde)) &&
      (!filters.hasta || (isoDate(a.fecha) && a.fecha <= filters.hasta)),
  );
  const filtered = Object.values(filters).some(Boolean);
  const countPeople = new Set(
    filtered
      ? selected.map((a) => a.person_id)
      : [...allPeople, ...selected.map((a) => a.person_id)],
  ).size;
  const counts = Object.fromEntries(
    categories.map((c) => [
      c,
      selected.filter((a) => a.categoria === c).length,
    ]),
  );
  const group = (key: string) =>
    Object.entries(
      selected.reduce((m: any, a: any) => {
        const k =
          key === "month"
            ? isoDate(a.fecha)
              ? a.fecha.slice(0, 7)
              : "Sin fecha válida"
            : a[key] || "Sin dato";
        m[k] = (m[k] || 0) + 1;
        return m;
      }, {}),
    )
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, value]) => ({ name, value }));
  return {
    personas: countPeople,
    total: selected.length,
    counts,
    ratio: countPeople ? counts["Atención"] / countPeople : 0,
    sources: [...new Set(selected.flatMap((a) => a.sources))],
    categorySources: Object.fromEntries(
      categories.map((c) => [
        c,
        [
          ...new Set(
            selected.filter((a) => a.categoria === c).flatMap((a) => a.sources),
          ),
        ],
      ]),
    ),
    byMonth: group("month"),
    byMunicipio: group("municipio"),
    byCategory: group("categoria"),
    records: selected,
    duplicatesOmitted: activities.length - unique.length,
  };
}
export function impactReport(user: User, filters: Filters = {}) {
  requireRole(user, ["admin"]);
  for (const k of ["desde", "hasta"] as const)
    if (filters[k] && !isoDate(filters[k]))
      throw new SyncError("Filtro de fecha inválido");
  if (filters.desde && filters.hasta && filters.desde > filters.hasta)
    throw new SyncError("Intervalo invertido");
  const patients = db.prepare("SELECT * FROM patients").all().map(decode);
  const canonical = (id: string): string => {
    const visited = new Set<string>();
    while (patients.find((p) => p.id === id)?.merged_into && !visited.has(id)) {
      visited.add(id);
      id = patients.find((p) => p.id === id).merged_into;
    }
    return id;
  };
  const jornadas = db.prepare("SELECT * FROM jornadas").all().map(decode);
  const activities = db
    .prepare("SELECT * FROM attentions")
    .all()
    .map(decode)
    .map((a) => ({
      ...a,
      person_id: canonical(a.paciente_uuid),
      native: true,
      fuente: "Aplicación EIRA",
      municipio:
        jornadas.find((j) => j.id === a.jornada_id)?.municipio ||
        patients.find((p) => p.id === a.paciente_uuid)?.municipio ||
        "",
      cantidad: "1",
      unidad: "registro",
    }));
  const imports = db
    .prepare(
      "SELECT r.*,b.source FROM import_rows r JOIN import_batches b ON r.batch_id=b.id WHERE b.state='consolidated' AND r.included=1",
    )
    .all()
    .map((r: any) => ({
      ...JSON.parse(r.data),
      person_id: canonical(r.person_id),
      native: false,
      batch_id: r.batch_id,
      import_row_id: r.id,
    }));
  const merged = [...activities, ...imports];
  const report = aggregate(
    merged,
    patients.filter((p) => !p.merged_into).map((p) => p.id),
    filters,
  );
  const includedRows = new Set(
    report.records.flatMap((r: any) => r.import_ids),
  );
  const adjustments = db
    .prepare(
      "SELECT * FROM audit_logs WHERE modulo='impacto' AND accion='ajuste_manual' ORDER BY id",
    )
    .all()
    .map((r: any) => ({ ...r, detalle: JSON.parse(r.detalle) }))
    .filter(
      (r: any) =>
        !Object.values(filters).some(Boolean) || includedRows.has(r.entidad_id),
    );
  return {
    ...report,
    filters,
    cutoff: new Date().toISOString(),
    adjustments,
    options: Object.fromEntries(
      ["programa", "municipio", "tipo_servicio", "fuente"].map((k) => [
        k,
        [...new Set(merged.map((a) => a[k]).filter(Boolean))].sort(),
      ]),
    ),
    denominator: report.personas,
    universe: Object.values(filters).some(Boolean)
      ? "Personas con actividad en la selección"
      : "Expedientes activos + personas importadas incluidas",
    quantityNote:
      "Cada actividad cuenta un registro. Cantidad/unidad no multiplica personas ni mezcla piezas con paquetes.",
  };
}
export async function exportImpact(
  user: User,
  filters: Filters,
  format: string,
) {
  const r = impactReport(user, filters);
  audit(user, "impacto", "exportar_informe", format, {
    filters,
    cutoff: r.cutoff,
  });
  const lines = [
    ["Informe de impacto", "Fecha de corte", r.cutoff],
    ["Filtros", JSON.stringify(filters)],
    ["Fuentes", r.sources.join("; ")],
    ["Indicador", "Valor", "Denominador", "Fórmula", "Fuentes"],
    [
      "Personas únicas",
      r.personas,
      r.personas,
      "COUNT DISTINCT persona canónica",
      r.sources.join("; "),
    ],
    [
      "Actividades totales",
      r.total,
      r.personas,
      "COUNT actividades no duplicadas",
      r.sources.join("; "),
    ],
    ...Object.entries(r.counts).map(([k, v]) => [
      k,
      v,
      r.personas,
      "COUNT registros categoria = " + k,
      r.categorySources[k].join("; "),
    ]),
    [
      "Atenciones por persona (categoría)",
      r.ratio,
      r.personas,
      "Atenciones categoría / personas únicas",
      r.categorySources["Atención"].join("; "),
    ],
    ["Universo", r.universe],
    ["Duplicados de actividad omitidos", r.duplicatesOmitted],
    ["ANEXO · AJUSTES MANUALES"],
    ["Quién", "Cuándo", "Fuente", "Fila", "Por qué", "Antes", "Después"],
    ...r.adjustments.map((a) => [
      a.usuario,
      a.timestamp,
      a.detalle.fuente,
      a.detalle.fila,
      a.detalle.motivo,
      JSON.stringify(a.detalle.antes),
      JSON.stringify(a.detalle.despues),
    ]),
  ];
  if (format === "csv")
    return Buffer.from(
      "\uFEFF" + lines.map((row) => row.map(csvCell).join(",")).join("\r\n"),
    );
  return documentPDF("INFORME DE IMPACTO", [
    `Fecha de corte: ${r.cutoff}`,
    `Filtros: ${JSON.stringify(filters)}`,
    `Fuentes: ${r.sources.join(", ") || "Sin datos"}`,
    `Denominador: ${r.personas} personas únicas. ${r.universe}.`,
    ...lines.slice(4, 12).map((row) => row.join(" | ")),
    r.quantityNote,
    `Duplicados de actividad omitidos: ${r.duplicatesOmitted}`,
    "ANEXO · AJUSTES MANUALES",
    ...r.adjustments.map(
      (a) =>
        `${a.usuario} | ${a.timestamp} | ${a.detalle.fuente}, fila ${a.detalle.fila} | Motivo: ${a.detalle.motivo} | Antes: ${JSON.stringify(a.detalle.antes)} | Después: ${JSON.stringify(a.detalle.despues)}`,
    ),
    ...(!r.adjustments.length ? ["Sin ajustes manuales en la selección."] : []),
  ]);
}
