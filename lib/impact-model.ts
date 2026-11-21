import {
  normalized,
  jaroWinkler,
  scoreMatch,
  MATCH_THRESHOLD,
} from "./matching";
export const categories = [
  "Servicio",
  "Atención",
  "Estudio",
  "Entrega de Insumos",
  "Participación",
];
export const dictionary = [
  ["nombre", "Nombre completo de la persona", "texto", "persona", "No vacío"],
  [
    "fecha_nacimiento",
    "Nacimiento declarado; no se infiere del nombre",
    "fecha ISO",
    "día",
    "1900–hoy",
  ],
  [
    "telefono",
    "Contacto telefónico opcional",
    "texto",
    "dígitos",
    "10–15 dígitos",
  ],
  [
    "curp",
    "CURP opcional; no se fabrica",
    "texto",
    "identificador",
    "Patrón mexicano de 18 caracteres",
  ],
  [
    "municipio",
    "Municipio declarado por la fuente",
    "texto",
    "municipio",
    "No vacío",
  ],
  [
    "programa",
    "Programa al que corresponde la actividad",
    "texto",
    "programa",
    "No vacío",
  ],
  [
    "categoria",
    "Clase de actividad; nunca equivale a persona",
    "enumeración",
    "registro",
    categories.join(" / "),
  ],
  [
    "tipo_servicio",
    "Servicio o actividad específica",
    "texto",
    "tipo de servicio",
    "No vacío",
  ],
  [
    "fecha",
    "Fecha de la actividad; periodo de los indicadores",
    "fecha ISO",
    "día",
    "2000–hoy",
  ],
  [
    "cantidad",
    "Cantidad informada; no multiplica personas ni actividades",
    "número",
    "Según unidad",
    "Mayor que 0 y hasta 1 000 000",
  ],
  [
    "unidad",
    "Unidad de la cantidad; no sumar unidades heterogéneas",
    "texto",
    "unidad declarada",
    "registro, pieza, paquete, etc.",
  ],
  [
    "fuente",
    "Origen trazable de cada fila",
    "texto",
    "fuente",
    "Nombre del lote / origen declarado",
  ],
].map(([key, definition, type, unit, valid]) => ({
  key,
  definition,
  type,
  unit,
  valid,
  periodo:
    key === "fecha"
      ? "Periodo de actividad"
      : key === "fecha_nacimiento"
        ? "Fecha de nacimiento"
        : "Según fecha de actividad",
  programa: "Columna programa o valor confirmado por fuente",
  fuente: "Columna fuente o nombre del lote",
}));
export const fields = dictionary.map((d) => d.key);
const synonyms: Record<string, string[]> = {
  nombre: [
    "nombre",
    "nombre completo",
    "nombre de beneficiaria",
    "paciente",
    "beneficiaria",
  ],
  fecha_nacimiento: [
    "fecha nacimiento",
    "fecha_nac",
    "nacimiento",
    "fecha de nacimiento",
    "dob",
  ],
  telefono: ["telefono", "telefono contacto", "celular", "tel", "movil"],
  curp: ["curp", "curp opcional"],
  municipio: ["municipio", "municipio atencion", "localidad"],
  programa: ["programa", "program"],
  categoria: ["categoria", "clase", "category"],
  tipo_servicio: [
    "tipo servicio",
    "servicio otorgado",
    "servicio",
    "estudio",
    "actividad",
  ],
  fecha: ["fecha", "fecha visita", "fecha estudio", "fecha atencion"],
  cantidad: ["cantidad", "total", "numero", "quantity"],
  unidad: ["unidad", "unit", "medida"],
  fuente: ["fuente", "origen", "source"],
};
const header = (s: string) =>
  normalized(s).replace(/[_-]/g, " ").replace(/\s+/g, " ");
export function autoMap(headers: string[]) {
  const mapping: Record<string, string> = {};
  const used = new Set<string>();
  for (const key of fields) {
    const ranked = headers
      .map((h) => ({
        h,
        score: Math.max(
          ...synonyms[key].map((s) =>
            header(h) === header(s) ? 1 : jaroWinkler(header(h), header(s)),
          ),
        ),
      }))
      .filter((v) => !used.has(v.h) && v.score >= 0.87)
      .sort((a, b) => b.score - a.score);
    if (ranked[0]) {
      mapping[key] = ranked[0].h;
      used.add(ranked[0].h);
    }
  }
  return mapping;
}
export function parseCSV(text: string) {
  text = text.replace(/^\uFEFF/, "");
  const first = text.split(/\r?\n/)[0];
  const delimiter =
    (first.match(/;/g) || []).length > (first.match(/,/g) || []).length
      ? ";"
      : ",";
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quote && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quote = !quote;
    } else if (c === delimiter && !quote) {
      row.push(cell);
      cell = "";
    } else if ((c === "\n" || c === "\r") && !quote) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((s) => s.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
    if (rows.length > 2001) throw Error("Máximo 2000 filas por archivo");
  }
  if (quote) throw Error("CSV inválido: comillas sin cerrar");
  row.push(cell);
  if (row.some((s) => s.trim())) rows.push(row);
  return tabular(rows);
}
export function tabular(rows: unknown[][]) {
  if (rows.length < 2)
    throw Error("El archivo necesita encabezados y al menos una fila");
  if (rows.length > 2001 || rows[0].length > 60)
    throw Error("Límite: 2000 filas y 60 columnas");
  const headers = rows[0].map((s) => String(s ?? "").trim());
  if (
    headers.some((h) => !h || h.length > 150) ||
    new Set(headers).size !== headers.length
  )
    throw Error("Encabezados vacíos, duplicados o demasiado largos");
  return {
    headers,
    rows: rows.slice(1).map((row, i) => {
      if (row.length > headers.length)
        throw Error(`Fila ${i + 2}: sobran columnas`);
      return Object.fromEntries(
        headers.map((h, k) => [
          h,
          String(row[k] ?? "")
            .slice(0, 2000)
            .trim(),
        ]),
      );
    }),
  };
}
export function isoDate(value: unknown) {
  const s = String(value ?? "").trim();
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  const v = match ? `${match[3]}-${match[2]}-${match[1]}` : s;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(v) ||
    !Number.isFinite(Date.parse(v)) ||
    new Date(v).toISOString().slice(0, 10) !== v
  )
    return "";
  return v;
}
export function normalizeRow(
  raw: Record<string, string>,
  mapping: Record<string, string>,
  defaults: Record<string, string>,
) {
  const row: Record<string, string> = {};
  for (const key of fields)
    row[key] = String(
      mapping[key] ? (raw[mapping[key]] ?? "") : (defaults[key] ?? ""),
    ).trim();
  for (const key of ["fecha", "fecha_nacimiento"])
    row[key] = isoDate(row[key]) || row[key];
  row.curp = row.curp.toUpperCase();
  return row;
}
export type Issue = {
  rule: string;
  message: string;
  severity: "error" | "aviso";
};
export function quality(
  row: Record<string, string>,
  now = new Date().toISOString().slice(0, 10),
) {
  const issues: Issue[] = [];
  const add = (
    rule: string,
    message: string,
    severity: "error" | "aviso" = "error",
  ) => issues.push({ rule, message, severity });
  for (const k of [
    "nombre",
    "fecha_nacimiento",
    "municipio",
    "programa",
    "categoria",
    "tipo_servicio",
    "fecha",
  ])
    if (!row[k]) add("requerido_" + k, `Falta ${k}`);
  for (const k of ["fecha", "fecha_nacimiento"])
    if (row[k]) {
      const date = isoDate(row[k]);
      if (!date)
        add("formato_" + k, `${k}: fecha inexistente o formato inválido`);
      else if (
        date > now ||
        date < (k === "fecha" ? "2000-01-01" : "1900-01-01")
      )
        add("rango_" + k, `${k}: fuera del intervalo permitido`);
    }
  if (
    (row.telefono && !/^\+?[\d\s()-]{10,22}$/.test(row.telefono)) ||
    (row.telefono && !/^\d{10,15}$/.test(row.telefono.replace(/\D/g, "")))
  )
    add("formato_telefono", "Teléfono: requiere entre 10 y 15 dígitos");
  if (
    row.curp &&
    !/^[A-Z][AEIOUX][A-Z]{2}\d{6}[HM][A-Z]{5}[A-Z\d]\d$/.test(row.curp)
  )
    add("formato_curp", "CURP: patrón mexicano de 18 caracteres inválido");
  if (!categories.includes(row.categoria))
    add("categoria_invalida", "Categoría fuera del catálogo");
  const quantity = Number(row.cantidad);
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1000000)
    add("rango_cantidad", "Cantidad: mayor que cero y hasta un millón");
  if (!row.unidad) add("requerido_unidad", "Falta unidad");
  if (!row.telefono)
    add("telefono_ausente", "Sin teléfono en la fuente", "aviso");
  return issues;
}
export function patientShape(r: any) {
  return {
    ...r,
    nombre_completo: r.nombre || r.nombre_completo,
    curp_opcional: r.curp || r.curp_opcional,
  };
}
export function identityCandidates(row: any, people: any[]) {
  return people
    .filter((p) => !p.merged_into)
    .map((p) => ({
      id: p.id,
      nombre: p.nombre || p.nombre_completo,
      fecha_nacimiento: p.fecha_nacimiento,
      municipio: p.municipio,
      fuente: p.fuente || "Aplicación EIRA",
      ...scoreMatch(patientShape(row), patientShape(p)),
    }))
    .filter((m) => m.score >= MATCH_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
}
export function identityIssues(row: any, matches: any[]): Issue[] {
  const issues: Issue[] = [];
  if (matches.length)
    issues.push({
      rule: "duplicado_probable",
      message:
        "Posible misma persona: confirma el vínculo explícitamente; no implica actividad duplicada",
      severity: "aviso",
    });
  for (const [key, label] of [
    ["fecha_nacimiento", "nacimiento"],
    ["municipio", "municipio"],
  ])
    if (
      matches.some(
        (m) =>
          normalized(m.nombre) === normalized(row.nombre) &&
          row[key] &&
          m[key] &&
          normalized(row[key]) !== normalized(m[key]),
      )
    )
      issues.push({
        rule: "discrepancia_" + key,
        message: `Mismo nombre con diferente ${label}; comparar fuentes`,
        severity: "aviso",
      });
  return issues;
}
export function csvCell(v: unknown) {
  let s = String(v ?? "");
  if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}
