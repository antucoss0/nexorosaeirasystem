import { randomUUID } from "node:crypto";
import { db, decode, save, normalize, audit } from "./db";
import { can, type User } from "./rbac";
export type Table = "patients" | "attentions" | "jornadas";
export type Operation = {
  opId: string;
  table: Table;
  entityId: string;
  type: "create" | "update";
  patch: Record<string, any>;
  baseVersion: number;
  createdAt: string;
};
const fields: Record<Table, string[]> = {
  patients: [
    "nombre_completo",
    "fecha_nacimiento",
    "telefono",
    "municipio",
    "curp_opcional",
    "contacto_alterno",
    "email",
    "sin_conectividad_propia",
    "entidad_nacimiento",
    "residencia",
    "afiliacion",
  ],
  attentions: [
    "paciente_uuid",
    "jornada_id",
    "programa",
    "categoria",
    "tipo_servicio",
    "fecha",
    "form_data",
    "estado_pap",
    "pdf_file_id",
    "token_hash",
    "expira_en",
    "pin_method",
    "leido_en",
  ],
  jornadas: [
    "municipio",
    "sede",
    "fecha",
    "servicios",
    "responsables",
    "requisitos",
    "versiones_carta",
    "estado_general",
  ],
};
export class SyncError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
function allowed(user: User, op: Operation, current: any) {
  const permission =
    op.table === "patients"
      ? "patient_write"
      : op.table === "attentions"
        ? "attention_write"
        : "jornada_write";
  if (!can(user.role, permission))
    throw new SyncError("No tienes permiso para esta operación", 403);
  if (op.table === "attentions") {
    const protectedFields = [
      "pdf_file_id",
      "token_hash",
      "expira_en",
      "pin_method",
      "leido_en",
    ];
    if (protectedFields.some((k) => k in op.patch))
      throw new SyncError(
        "Los resultados requieren el flujo seguro de archivos",
        403,
      );
    if (
      op.patch.estado_pap &&
      op.patch.estado_pap !== "pendiente" &&
      !(
        op.patch.estado_pap === "autorizado_medico" &&
        can(user.role, "authorize_pap")
      )
    )
      throw new SyncError("Solo el médico autoriza PAP", 403);
    if (
      user.role === "consulta_clinica" &&
      Object.keys(op.patch).some(
        (k) => !["estado_pap", "form_data"].includes(k),
      )
    )
      throw new SyncError("Edición clínica no permitida", 403);
  }
  if (op.table === "jornadas") {
    if (
      user.role === "municipio" &&
      (op.type === "create" ||
        current?.municipio !== user.municipio ||
        ("municipio" in op.patch && op.patch.municipio !== user.municipio))
    )
      throw new SyncError("Jornada fuera de tu municipio", 403);
    if (
      !can(user.role, "approve_requirements") &&
      ("versiones_carta" in op.patch || "estado_general" in op.patch)
    )
      throw new SyncError(
        "Solo administración modifica cartas y estado general",
        403,
      );
    if (
      !can(user.role, "approve_requirements") &&
      Array.isArray(op.patch.requisitos)
    ) {
      for (const requisito of op.patch.requisitos) {
        const prev = current?.requisitos?.find(
          (r: any) => r.clave === requisito.clave,
        );
        if (
          requisito.estado === "aprobado" &&
          JSON.stringify(prev) !== JSON.stringify(requisito)
        )
          throw new SyncError("Solo administración aprueba requisitos", 403);
      }
    }
  }
}
export function validateOperation(value: any): asserts value is Operation {
  if (
    !value ||
    typeof value.opId !== "string" ||
    value.opId.length > 150 ||
    !["patients", "attentions", "jornadas"].includes(value.table) ||
    typeof value.entityId !== "string" ||
    value.entityId.length > 150 ||
    !["create", "update"].includes(value.type) ||
    !value.patch ||
    typeof value.patch !== "object" ||
    Array.isArray(value.patch) ||
    !Number.isInteger(value.baseVersion) ||
    value.baseVersion < 0 ||
    Object.keys(value.patch).some(
      (k) => !fields[value.table as Table].includes(k),
    )
  )
    throw new SyncError("Operación inválida");
  if (value.type === "create" && value.baseVersion !== 0)
    throw new SyncError("La creación requiere versión cero");
  if (!Object.keys(value.patch).length) throw new SyncError("Parche vacío");
}
function validateData(table: Table, data: any) {
  const required =
    table === "patients"
      ? ["nombre_completo", "fecha_nacimiento", "municipio"]
      : table === "attentions"
        ? [
            "paciente_uuid",
            "jornada_id",
            "programa",
            "categoria",
            "tipo_servicio",
            "fecha",
          ]
        : ["municipio", "sede", "fecha"];
  for (const k of required)
    if (typeof data[k] !== "string" || !data[k].trim())
      throw new SyncError(`Campo requerido: ${k}`);
  for (const k of ["fecha", "fecha_nacimiento"])
    if (
      data[k] &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(data[k]) ||
        Number.isNaN(Date.parse(data[k])) ||
        new Date(data[k]).toISOString().slice(0, 10) !== data[k])
    )
      throw new SyncError(`Fecha inválida: ${k}`);
  if (table === "attentions") {
    if (
      ![
        "Servicio",
        "Atención",
        "Estudio",
        "Entrega de Insumos",
        "Participación",
      ].includes(data.categoria)
    )
      throw new SyncError("Categoría inválida");
    if (
      !db
        .prepare("SELECT id FROM patients WHERE id=?")
        .get(data.paciente_uuid) ||
      !db.prepare("SELECT id FROM jornadas WHERE id=?").get(data.jornada_id)
    )
      throw new SyncError("Paciente o jornada inexistente");
  }
  if (table === "jornadas") {
    for (const k of [
      "servicios",
      "responsables",
      "requisitos",
      "versiones_carta",
    ])
      if (k in data && !Array.isArray(data[k]))
        throw new SyncError(`Lista inválida: ${k}`);
    if (
      data.requisitos?.some(
        (r: any) =>
          !r ||
          typeof r.clave !== "string" ||
          typeof r.nombre !== "string" ||
          !["pendiente", "recibido", "observado", "aprobado"].includes(
            r.estado,
          ),
      )
    )
      throw new SyncError("Requisito inválido");
  }
}
export function applyOperations(user: User, ops: Operation[]) {
  return db
    .transaction(() => {
      const results: any[] = [];
      const remaps: Record<string, string> = {};
      for (const original of ops) {
        validateOperation(original);
        const op = { ...original, patch: { ...original.patch } };
        const previous = db
          .prepare("SELECT * FROM applied_ops WHERE op_id=?")
          .get(op.opId) as any;
        if (previous) {
          if (previous.user_id !== user.id)
            throw new SyncError(
              "Identificador de operación no disponible",
              403,
            );
          const result = JSON.parse(previous.result);
          results.push(result);
          if (result.remap) remaps[result.remap.from] = result.remap.to;
          continue;
        }
        if (op.patch.paciente_uuid)
          op.patch.paciente_uuid =
            remaps[op.patch.paciente_uuid] || op.patch.paciente_uuid;
        let id = remaps[op.entityId] || op.entityId;
        const current = decode(
          db.prepare(`SELECT * FROM ${op.table} WHERE id=?`).get(id),
        );
        allowed(user, op, current);
        if (op.type === "update" && !current)
          throw new SyncError("Registro no encontrado", 404);
        if (op.type === "create" && current)
          throw new SyncError("El registro ya existe", 409);
        let result: any;
        if (op.type === "update" && op.baseVersion !== current.version) {
          const history = db
            .prepare(
              "SELECT data FROM record_history WHERE table_name=? AND entity_id=? AND version=?",
            )
            .get(op.table, id, op.baseVersion) as any;
          const base = history ? JSON.parse(history.data) : null;
          const conflicting = Object.keys(op.patch).filter(
            (k) =>
              !base || JSON.stringify(base[k]) !== JSON.stringify(current[k]),
          );
          if (conflicting.length) {
            const conflictId = randomUUID();
            db.prepare("INSERT INTO conflicts VALUES (?,?,?,?,?,?,?,?,?)").run(
              conflictId,
              op.table,
              id,
              user.id,
              op.opId,
              JSON.stringify(current),
              JSON.stringify(op.patch),
              JSON.stringify(conflicting),
              new Date().toISOString(),
            );
            audit(user, op.table, "conflict", id, {
              opId: op.opId,
              fields: conflicting,
            });
            result = {
              opId: op.opId,
              status: "conflict",
              entityId: id,
              conflictId,
              fields: conflicting,
              server: current,
            };
          }
        }
        if (!result) {
          let remap;
          if (op.table === "patients" && op.type === "create") {
            const max = db
              .prepare(
                "SELECT MAX(CAST(SUBSTR(id,9) AS INTEGER)) AS n FROM patients WHERE id LIKE 'EIRA-MX-%'",
              )
              .get() as any;
            id = `EIRA-MX-${String((max.n || 0) + 1).padStart(3, "0")}`;
            remaps[op.entityId] = id;
            remap = { from: op.entityId, to: id };
          }
          const data = { ...(current || {}), ...op.patch };
          delete data.id;
          delete data.version;
          delete data.updated_at;
          delete data.updated_by;
          if (op.table === "patients") {
            data.uuid = id;
            data.nombre_normalizado = normalize(data.nombre_completo || "");
            data.sync_status = "synced";
          }
          validateData(op.table, data);
          const record = save(
            op.table,
            id,
            data,
            (current?.version || 0) + 1,
            user.id,
          );
          audit(user, op.table, op.type, id, {
            opId: op.opId,
            patch: op.patch,
          });
          result = {
            opId: op.opId,
            status: "applied",
            entityId: id,
            record,
            ...(remap ? { remap } : {}),
          };
        }
        db.prepare("INSERT INTO applied_ops VALUES (?,?,?)").run(
          op.opId,
          user.id,
          JSON.stringify(result),
        );
        results.push(result);
      }
      return { results, remaps };
    })
    .immediate();
}
export function pull(user: User, since: string) {
  const result: Record<string, any> = {};
  for (const table of ["patients", "attentions", "jornadas"]) {
    if (table !== "jornadas" && !can(user.role, "clinical_read")) {
      result[table] = [];
      continue;
    }
    result[table] = db
      .prepare(
        `SELECT * FROM ${table} WHERE updated_at>=? ORDER BY updated_at,id`,
      )
      .all(since)
      .map(decode)
      .filter(
        (r) => user.role !== "municipio" || r.municipio === user.municipio,
      );
  }
  return result;
}
