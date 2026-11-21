import { randomUUID } from "node:crypto";
import { db, decode, save, normalize, audit } from "./db";
import { can, type User } from "./rbac";
import { schemas } from "./clinical";
import { flattenPatch, expandPatch, fieldValue } from "./patches";
export type Table = "patients" | "attentions" | "jornadas" | "decisions";
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
  decisions: [
    "action",
    "patientId",
    "otherId",
    "candidateIds",
    "choices",
    "conflictId",
    "expectedVersion",
    "note",
  ],
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
    "visit_id",
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
      op.type === "update" &&
      ["consulta_clinica", "laboratorio"].includes(user.role) &&
      Object.keys(op.patch).some(
        (k) => !["estado_pap", "form_data"].includes(k),
      )
    )
      throw new SyncError("Edición clínica no permitida", 403);
    if (op.type === "create" && user.role === "laboratorio")
      throw new SyncError("Solo captura o médico crean estudios", 403);
    if ("form_data" in op.patch) {
      const form = op.patch.form_data;
      const old = current?.form_data || {};
      if (!form || typeof form !== "object" || Array.isArray(form))
        throw new SyncError("Formulario inválido");
      const kind = form.kind || old.kind;
      if (kind) {
        if ((op.patch.categoria || current?.categoria) !== "Estudio")
          throw new SyncError("Formulario requiere categoría Estudio");
        if ("kind" in form && form.kind !== kind)
          throw new SyncError("No se puede eliminar el tipo de formulario");
        if (!Object.hasOwn(schemas, kind) || (old.kind && old.kind !== kind))
          throw new SyncError("Tipo de formulario inválido");
        const all = schemas[kind].flatMap((s) => s.fields);
        if (
          Object.keys(form).some(
            (k) => k !== "kind" && !all.some((f) => f.key === k),
          )
        )
          throw new SyncError("Campo clínico desconocido");
        for (const field of all) {
          if (!(field.key in form)) continue;
          const v = form[field.key];
          if (field.multi) {
            if (
              !Array.isArray(v) ||
              v.some(
                (s) => typeof s !== "string" || !field.options?.includes(s),
              )
            )
              throw new SyncError("Selección clínica inválida");
          } else if (typeof v !== "string" || v.length > 12000)
            throw new SyncError("Valor clínico inválido");
          if (
            field.options &&
            !field.multi &&
            typeof v === "string" &&
            v &&
            !field.options.includes(v)
          )
            throw new SyncError("Opción clínica inválida");
        }
        if (
          user.role === "laboratorio" &&
          all
            .filter((f) => !f.result)
            .some(
              (f) =>
                f.key in form &&
                JSON.stringify(form[f.key]) !== JSON.stringify(old[f.key]),
            )
        )
          throw new SyncError("Laboratorio solo edita resultados", 403);
        if (
          !can(user.role, "clinical_results") &&
          all
            .filter((f) => f.result)
            .some(
              (f) =>
                f.key in form &&
                JSON.stringify(form[f.key] ?? "") !==
                  JSON.stringify(old[f.key] ?? ""),
            )
        )
          throw new SyncError(
            "Solo médico o laboratorio editan resultados clínicos",
            403,
          );
        if (
          op.type === "create" &&
          (op.patch.categoria !== "Estudio" ||
            !["captura", "consulta_clinica", "admin"].includes(user.role))
        )
          throw new SyncError("Formulario requiere categoría Estudio", 403);
      } else if (Object.keys(form).length)
        throw new SyncError("Se requiere un tipo de formulario clínico válido");
    }
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
    !["patients", "attentions", "jornadas", "decisions"].includes(
      value.table,
    ) ||
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
        if (op.table === "attentions" && op.patch.paciente_uuid) {
          const seen = new Set<string>();
          let patient = decode(
            db
              .prepare("SELECT * FROM patients WHERE id=?")
              .get(op.patch.paciente_uuid),
          );
          while (patient?.merged_into) {
            if (seen.has(patient.id))
              throw new SyncError("Referencia de identidad inválida");
            seen.add(patient.id);
            op.patch.paciente_uuid = patient.merged_into;
            patient = decode(
              db
                .prepare("SELECT * FROM patients WHERE id=?")
                .get(patient.merged_into),
            );
          }
        }
        if (op.table === "decisions") {
          for (const k of ["patientId", "otherId"])
            if (op.patch[k]) op.patch[k] = remaps[op.patch[k]] || op.patch[k];
          if (Array.isArray(op.patch.candidateIds))
            op.patch.candidateIds = op.patch.candidateIds.map(
              (id: string) => remaps[id] || id,
            );
          const result = applyDecision(user, op);
          db.prepare("INSERT INTO applied_ops VALUES (?,?,?)").run(
            op.opId,
            user.id,
            JSON.stringify(result),
          );
          results.push(result);
          continue;
        }
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
          const conflicting = Object.keys(flattenPatch(op.patch)).filter(
            (k) =>
              !base ||
              JSON.stringify(fieldValue(base, k)) !==
                JSON.stringify(fieldValue(current, k)),
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
          if (op.table === "attentions" && op.patch.form_data)
            data.form_data = {
              ...(current?.form_data || {}),
              ...op.patch.form_data,
            };
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
function applyDecision(user: User, op: Operation) {
  if (op.type !== "create") throw new SyncError("Decisiones inmutables");
  const p = op.patch;
  const affected: { table: string; record: any }[] = [];
  const get = (table: string, id: string) =>
    decode(db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id));
  if (get("decisions", op.entityId))
    throw new SyncError("Decisiones inmutables", 409);
  const change = (table: string, record: any, patch: any) => {
    const data = { ...record, ...patch };
    if (table === "attentions" && patch.form_data)
      data.form_data = { ...record.form_data, ...patch.form_data };
    delete data.id;
    delete data.version;
    delete data.updated_at;
    delete data.updated_by;
    const saved = save(table, record.id, data, record.version + 1, user.id);
    affected.push({ table, record: saved });
    audit(user, table, p.action, record.id, { decision: op.entityId, patch });
    return saved;
  };
  if (["same_patient", "different_patient"].includes(p.action)) {
    if (!["captura", "consulta_clinica", "admin"].includes(user.role))
      throw new SyncError("Decisión no permitida", 403);
    if (!get("patients", p.patientId))
      throw new SyncError("Paciente inexistente");
    if (!Array.isArray(p.candidateIds) || !p.candidateIds.length)
      throw new SyncError("Se requieren candidatas de comparación");
    if (
      p.candidateIds.some(
        (id: unknown) =>
          typeof id !== "string" || !get("patients", id as string),
      )
    )
      throw new SyncError("Candidata inexistente");
    if (
      (p.action === "same_patient" && !p.candidateIds.includes(p.patientId)) ||
      (p.action === "different_patient" && p.candidateIds.includes(p.patientId))
    )
      throw new SyncError("La decisión no corresponde a la comparación");
  } else {
    if (user.role !== "admin")
      throw new SyncError(
        "Solo administración resuelve conflictos y duplicados",
        403,
      );
    if (p.action === "resolve_conflict") {
      const conflict = db
        .prepare("SELECT * FROM conflicts WHERE id=?")
        .get(p.conflictId) as any;
      if (
        !conflict ||
        db
          .prepare("SELECT * FROM conflict_resolutions WHERE conflict_id=?")
          .get(p.conflictId)
      )
        throw new SyncError("Conflicto inexistente o ya resuelto", 409);
      const current = get(conflict.table_name, conflict.entity_id);
      if (current.version !== p.expectedVersion)
        throw new SyncError(
          "El servidor cambió; actualiza y revisa otra vez",
          409,
        );
      const client = flattenPatch(JSON.parse(conflict.client_patch));
      const flat: Record<string, any> = {};
      if (
        !p.choices ||
        Object.keys(client).some(
          (k) => !["client", "server"].includes(p.choices[k]),
        ) ||
        Object.keys(p.choices).some((k) => !(k in client))
      )
        throw new SyncError("Elige un valor para cada campo");
      for (const k of Object.keys(client))
        if (p.choices[k] === "client") flat[k] = client[k];
      const patch = expandPatch(flat);
      if (Object.keys(patch).length) {
        allowed(
          user,
          { ...op, table: conflict.table_name, type: "update", patch },
          current,
        );
        validateData(conflict.table_name, { ...current, ...patch });
      }
      if (conflict.table_name === "patients" && patch.nombre_completo)
        patch.nombre_normalizado = normalize(patch.nombre_completo);
      change(conflict.table_name, current, patch);
      db.prepare("INSERT INTO conflict_resolutions VALUES (?,?,?)").run(
        p.conflictId,
        op.entityId,
        new Date().toISOString(),
      );
    } else if (["merge_patients", "dismiss_duplicate"].includes(p.action)) {
      const kept = get("patients", p.patientId),
        other = get("patients", p.otherId);
      if (
        !kept ||
        !other ||
        kept.id === other.id ||
        kept.merged_into ||
        other.merged_into
      )
        throw new SyncError("Par de pacientes inválido");
      if (p.action === "merge_patients") {
        for (const row of db
          .prepare("SELECT * FROM attentions WHERE paciente_uuid=?")
          .all(other.id))
          change("attentions", decode(row), { paciente_uuid: kept.id });
        change("patients", other, { merged_into: kept.id });
        change("patients", kept, {
          aliases: [...new Set([...(kept.aliases || []), other.id])],
        });
      }
    } else throw new SyncError("Decisión desconocida");
  }
  const record = save("decisions", op.entityId, p, 1, user.id);
  audit(user, "decisions", p.action, op.entityId, p);
  return {
    opId: op.opId,
    status: "applied",
    entityId: op.entityId,
    record,
    affected,
  };
}
export function pull(user: User, since: string) {
  const result: Record<string, any> = {
    resolved: can(user.role, "clinical_read")
      ? db
          .prepare(
            "SELECT DISTINCT c.entity_id FROM conflicts c JOIN conflict_resolutions r ON r.conflict_id=c.id WHERE NOT EXISTS (SELECT 1 FROM conflicts u LEFT JOIN conflict_resolutions ur ON ur.conflict_id=u.id WHERE u.entity_id=c.entity_id AND ur.conflict_id IS NULL)",
          )
          .all()
          .map((r: any) => r.entity_id)
      : [],
  };
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
