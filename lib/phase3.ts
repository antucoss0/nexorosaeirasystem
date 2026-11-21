import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { db, decode, save, audit, filesDir, normalize } from "./db";
import { SyncError } from "./sync";
import type { Role, User } from "./rbac";

db.exec(`
CREATE TABLE IF NOT EXISTS file_links(file_id TEXT PRIMARY KEY REFERENCES files(id),purpose TEXT NOT NULL,jornada_id TEXT,requirement_key TEXT,attention_id TEXT,owner TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS letters(id TEXT PRIMARY KEY,jornada_id TEXT NOT NULL,version INTEGER NOT NULL,template_version TEXT NOT NULL,clauses TEXT NOT NULL,clauses_hash TEXT NOT NULL,variables TEXT NOT NULL,diff TEXT NOT NULL,author TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(jornada_id,version));
CREATE TRIGGER IF NOT EXISTS letters_no_update BEFORE UPDATE ON letters BEGIN SELECT RAISE(ABORT,'immutable letter'); END;
CREATE TRIGGER IF NOT EXISTS letters_no_delete BEFORE DELETE ON letters BEGIN SELECT RAISE(ABORT,'immutable letter'); END;
CREATE TABLE IF NOT EXISTS notifications(id TEXT PRIMARY KEY,kind TEXT NOT NULL,municipio TEXT,jornada_id TEXT,requirement_key TEXT,attention_id TEXT,channel TEXT NOT NULL,recipient TEXT NOT NULL,message TEXT NOT NULL,created_at TEXT NOT NULL,author TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS pap_tokens(hash TEXT PRIMARY KEY,attention_id TEXT NOT NULL,file_id TEXT NOT NULL,expires_at INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,locked INTEGER NOT NULL DEFAULT 0,revoked INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS portal_sessions(hash TEXT PRIMARY KEY,token_hash TEXT NOT NULL,attention_id TEXT NOT NULL,expires_at INTEGER NOT NULL);
`);
export const contact =
  "Federico del Toro 83 int 205, Centro, Ciudad Guzmán, Jalisco, C.P. 49000. Tel. 3414108111 y 3411596782. hola@eiraac.org";
export const clauses = [
  "EIRA y el municipio colaboran en una jornada de prevención de cáncer de mama y cervicouterino, con trato digno, sin discriminación y con información clara para cada participante.",
  "El municipio proporcionará un espacio seguro, limpio, accesible y con áreas privadas para la atención, mobiliario, agua, energía eléctrica y condiciones sanitarias adecuadas.",
  "El municipio realizará difusión comunitaria responsable, sin prometer diagnósticos ni tratamientos, e informará los horarios, requisitos y servicios realmente disponibles.",
  "El municipio designará una persona enlace con disponibilidad para coordinar logística, requisitos documentales, recepción de equipos y seguimiento de acuerdos con EIRA.",
  "Ambas partes protegerán la privacidad y confidencialidad de los datos personales. No se divulgarán documentos clínicos, fotografías identificables ni listas de pacientes sin fundamento y consentimiento aplicables.",
  "EIRA coordinará al personal competente y la orientación preventiva. La entrega de documentos y referencias seguirá los controles de identidad y autorización clínica; esta carta no sustituye consentimiento informado ni garantiza un resultado específico.",
];
export const templateVersion = "EIRA-COMPROMISO-1";
export const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export const clausesHash = hash(JSON.stringify(clauses));
export function requireRole(user: User, roles: Role[]) {
  if (!roles.includes(user.role))
    throw new SyncError("Tu perfil no tiene permiso para esta acción", 403);
}
const text = (v: unknown, max = 500) => {
  if (typeof v !== "string" || !v.trim() || v.length > max)
    throw new SyncError("Completa los campos requeridos");
  return v.trim();
};
const date = (v: unknown) => {
  const s = text(v, 10);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(s) ||
    isNaN(Date.parse(s)) ||
    new Date(s).toISOString().slice(0, 10) !== s
  )
    throw new SyncError("Fecha inválida");
  return s;
};
export const record = (
  table: "jornadas" | "patients" | "attentions",
  id: string,
) => {
  const r = decode(db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id));
  if (!r) throw new SyncError("Registro no encontrado", 404);
  return r;
};
function change(
  table: "jornadas" | "attentions",
  current: any,
  patch: any,
  user: User,
  action: string,
) {
  const { id, version, updated_at, updated_by, ...data } = {
    ...current,
    ...patch,
  };
  const result = save(table, id, data, version + 1, user.id);
  audit(user, table, action, id, patch);
  return result;
}
export const defaults = [
  "Carta compromiso",
  "Fotografías del espacio",
  "Logotipos institucionales",
  "Persona enlace",
];
export function scopedJornada(user: User, id: string) {
  const j = record("jornadas", id);
  if (user.role === "municipio" && j.municipio !== user.municipio)
    throw new SyncError("Jornada fuera de tu municipio", 403);
  return j;
}
export function traffic(j: any, now = Date.now()) {
  const pending = (j.requisitos || []).filter(
    (r: any) => r.estado !== "aprobado",
  );
  const days = Math.ceil((Date.parse(j.fecha + "T00:00:00Z") - now) / 86400000);
  const observed = pending.filter((r: any) => r.estado === "observado").length;
  return {
    color: !pending.length
      ? "verde"
      : observed || days <= 7
        ? "rojo"
        : "amarillo",
    pending: pending.length,
    critical: pending.filter((r: any) => r.critico !== false).length,
    days,
  };
}
export function listJornadas(user: User) {
  return db
    .prepare("SELECT * FROM jornadas ORDER BY updated_at DESC")
    .all()
    .map(decode)
    .filter((j) => user.role !== "municipio" || j.municipio === user.municipio)
    .map((j) => ({
      ...j,
      traffic: traffic(j),
      letters: db
        .prepare(
          "SELECT id,version,template_version,clauses_hash,variables,diff,author,created_at FROM letters WHERE jornada_id=? ORDER BY version DESC",
        )
        .all(j.id)
        .map((l: any) => ({
          ...l,
          variables: JSON.parse(l.variables),
          diff: JSON.parse(l.diff),
        })),
    }));
}
export function listNotifications(user: User) {
  requireRole(user, ["admin", "municipio"]);
  return db
    .prepare(
      user.role === "municipio"
        ? "SELECT * FROM notifications WHERE kind='reminder' AND municipio=? ORDER BY created_at DESC"
        : "SELECT * FROM notifications ORDER BY created_at DESC",
    )
    .all(...(user.role === "municipio" ? [user.municipio] : []));
}
export function saveJornada(user: User, input: any) {
  requireRole(user, ["admin"]);
  if (
    Object.keys(input).some(
      (k) =>
        ![
          "id",
          "version",
          "municipio",
          "sede",
          "fecha",
          "servicios",
          "responsables",
          "persona_enlace",
          "requisitos",
        ].includes(k),
    )
  )
    throw new SyncError("Solo se permiten variables de jornada");
  return db
    .transaction(() => {
      const old = input.id ? record("jornadas", input.id) : null;
      if (old && input.version !== old.version)
        throw new SyncError(
          "La jornada cambió; actualiza antes de guardar",
          409,
        );
      const servicios = Array.isArray(input.servicios)
        ? input.servicios.map((s: any) => text(s, 150))
        : [];
      if (!servicios.length)
        throw new SyncError("Selecciona servicios ofertados");
      if (!Array.isArray(input.responsables))
        throw new SyncError("Responsables inválidos");
      const responsables = input.responsables.map((r: any) => ({
        nombre: text(r.nombre, 150),
        rol: text(r.rol, 100),
        contacto: text(r.contacto, 180),
      }));
      const names =
        input.requisitos ||
        defaults.map((nombre) => ({ nombre, critico: true }));
      if (!Array.isArray(names) || !names.length || names.length > 40)
        throw new SyncError("Configura entre 1 y 40 requisitos");
      const used = new Set();
      const requisitos = names.map((r: any) => {
        const prev = old?.requisitos?.find((p: any) => p.clave === r.clave);
        if (r.clave && !prev) throw new SyncError("Requisito desconocido");
        const clave = prev?.clave || randomUUID();
        if (used.has(clave)) throw new SyncError("Requisito duplicado");
        used.add(clave);
        return {
          ...prev,
          clave,
          nombre: text(r.nombre, 180),
          critico: r.critico !== false,
          estado: prev?.estado || "pendiente",
          historial: prev?.historial || [],
          nota_correccion: prev?.nota_correccion || "",
          file_id: prev?.file_id || null,
        };
      });
      const data = {
        municipio: text(input.municipio, 150),
        sede: text(input.sede, 200),
        fecha: date(input.fecha),
        servicios,
        responsables,
        persona_enlace: {
          nombre: text(input.persona_enlace?.nombre, 150),
          contacto: text(input.persona_enlace?.contacto, 180),
        },
        requisitos,
        versiones_carta: old?.versiones_carta || [],
        estado_general: old?.estado_general || "En preparación",
      };
      if (
        old &&
        old.municipio !== data.municipio &&
        (old.versiones_carta?.length ||
          old.requisitos?.some((r: any) => r.file_id))
      )
        throw new SyncError(
          "No cambies el municipio de una jornada con documentación",
        );
      if (old) return change("jornadas", old, data, user, "editar");
      const id = "JOR-" + randomUUID();
      const result = save("jornadas", id, data, 1, user.id);
      audit(user, "jornadas", "crear", id, data);
      return result;
    })
    .immediate();
}
export function transitionRequirement(
  user: User,
  jornadaId: string,
  key: string,
  state: string,
  note = "",
  fileId?: string,
) {
  return db
    .transaction(() => {
      const j = scopedJornada(user, jornadaId);
      const r = j.requisitos?.find((r: any) => r.clave === key);
      if (!r) throw new SyncError("Requisito no encontrado", 404);
      if (state === "recibido") {
        requireRole(user, ["admin", "municipio"]);
        if (r.estado === "aprobado")
          throw new SyncError(
            "Solicita corrección antes de reemplazar un requisito aprobado",
          );
        const file = db
          .prepare("SELECT * FROM file_links WHERE file_id=?")
          .get(fileId) as any;
        if (
          !file ||
          file.jornada_id !== j.id ||
          file.requirement_key !== key ||
          file.owner !== user.id
        )
          throw new SyncError("Archivo no autorizado", 403);
      } else {
        requireRole(user, ["admin"]);
        if (
          !["observado", "aprobado"].includes(state) ||
          !r.file_id ||
          !["recibido", "observado", "aprobado"].includes(r.estado)
        )
          throw new SyncError("Transición de requisito inválida");
        if (state === "observado") text(note, 1500);
      }
      const event = {
        de: r.estado,
        a: state,
        nota: state === "observado" ? note : "",
        file_id: fileId || r.file_id,
        autor: user.id,
        fecha: new Date().toISOString(),
      };
      return change(
        "jornadas",
        j,
        {
          requisitos: j.requisitos.map((item: any) =>
            item.clave === key
              ? {
                  ...item,
                  estado: state,
                  file_id: fileId || item.file_id,
                  nota_correccion: state === "observado" ? note : "",
                  historial: [...(item.historial || []), event],
                }
              : item,
          ),
        },
        user,
        "requisito_" + state,
      );
    })
    .immediate();
}
export function generateLetter(user: User, input: any) {
  requireRole(user, ["admin"]);
  if (Object.keys(input).some((k) => !["jornadaId", "variables"].includes(k)))
    throw new SyncError("Las cláusulas están protegidas");
  return db
    .transaction(() => {
      const j = scopedJornada(user, input.jornadaId);
      const v = input.variables;
      if (
        !v ||
        Object.keys(v).some(
          (k) =>
            ![
              "municipio",
              "presidente",
              "enlace",
              "sede",
              "fecha",
              "servicios",
              "beneficiarias",
            ].includes(k),
        )
      )
        throw new SyncError("Solo se permiten variables de la carta");
      const variables = {
        municipio: text(v.municipio, 150),
        presidente: text(v.presidente, 150),
        enlace: text(v.enlace, 150),
        sede: text(v.sede, 200),
        fecha: date(v.fecha),
        servicios: Array.isArray(v.servicios)
          ? v.servicios.map((s: any) => text(s, 150))
          : [],
        beneficiarias: Number(v.beneficiarias),
      };
      if (
        variables.municipio !== j.municipio ||
        !variables.servicios.length ||
        !Number.isInteger(variables.beneficiarias) ||
        variables.beneficiarias < 1 ||
        variables.beneficiarias > 100000
      )
        throw new SyncError("Variables de carta inválidas");
      const previous = db
        .prepare(
          "SELECT * FROM letters WHERE jornada_id=? ORDER BY version DESC LIMIT 1",
        )
        .get(j.id) as any;
      const before = previous ? JSON.parse(previous.variables) : {};
      const diff = Object.fromEntries(
        Object.entries(variables)
          .filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(before[k]))
          .map(([k, v]) => [k, { antes: before[k] ?? null, despues: v }]),
      );
      const letter = {
        id: randomUUID(),
        jornada_id: j.id,
        version: (previous?.version || 0) + 1,
        template_version: templateVersion,
        clauses: JSON.stringify(clauses),
        clauses_hash: clausesHash,
        variables: JSON.stringify(variables),
        diff: JSON.stringify(diff),
        author: user.id,
        created_at: new Date().toISOString(),
      };
      db.prepare(
        "INSERT INTO letters VALUES (@id,@jornada_id,@version,@template_version,@clauses,@clauses_hash,@variables,@diff,@author,@created_at)",
      ).run(letter);
      change(
        "jornadas",
        j,
        {
          versiones_carta: [
            ...(j.versiones_carta || []),
            {
              id: letter.id,
              version: letter.version,
              hash: clausesHash,
              author: user.id,
              created_at: letter.created_at,
            },
          ],
        },
        user,
        "generar_carta",
      );
      return { ...letter, variables, diff, clauses };
    })
    .immediate();
}
export function verifiedLetter(user: User, jornadaId: string, version: number) {
  scopedJornada(user, jornadaId);
  const row = db
    .prepare("SELECT * FROM letters WHERE jornada_id=? AND version=?")
    .get(jornadaId, version) as any;
  if (!row) throw new SyncError("Carta no encontrada", 404);
  if (
    row.template_version !== templateVersion ||
    hash(row.clauses) !== row.clauses_hash ||
    row.clauses_hash !== clausesHash
  )
    throw new SyncError("La integridad de la carta no es válida", 409);
  return {
    ...row,
    clauses: JSON.parse(row.clauses),
    variables: JSON.parse(row.variables),
  };
}
export function remind(
  user: User,
  jornadaId: string,
  key: string,
  now = Date.now(),
) {
  requireRole(user, ["admin"]);
  return db
    .transaction(() => {
      const j = record("jornadas", jornadaId);
      const r = j.requisitos.find((r: any) => r.clave === key);
      if (!r || r.estado === "aprobado")
        throw new SyncError("No hay un pendiente para este requisito");
      const last = db
        .prepare(
          "SELECT created_at FROM notifications WHERE kind='reminder' AND jornada_id=? AND requirement_key=? ORDER BY created_at DESC LIMIT 1",
        )
        .get(j.id, key) as any;
      if (last && now - Date.parse(last.created_at) < 86400000)
        throw new SyncError(
          "Ya se envió un recordatorio en las últimas 24 horas",
          429,
        );
      const message =
        "Hola, gracias por acompañarnos. Cuando te sea posible, revisa un requisito pendiente en tu espacio municipal de EIRA. Si necesitas apoyo, estamos para ayudarte.";
      insertNotification(
        user,
        {
          kind: "reminder",
          municipio: j.municipio,
          jornada_id: j.id,
          requirement_key: key,
          message,
          channel: "app",
          recipient: j.persona_enlace?.contacto || j.municipio,
        },
        now,
      );
      audit(user, "jornadas", "recordatorio_amable", j.id, {
        requisito: key,
        message,
      });
      return { message };
    })
    .immediate();
}
function insertNotification(user: User, n: any, now = Date.now()) {
  const row = {
    id: randomUUID(),
    kind: n.kind,
    municipio: n.municipio || null,
    jornada_id: n.jornada_id || null,
    requirement_key: n.requirement_key || null,
    attention_id: n.attention_id || null,
    channel: n.channel,
    recipient: n.recipient,
    message: n.message,
    created_at: new Date(now).toISOString(),
    author: user.id,
  };
  db.prepare(
    "INSERT INTO notifications VALUES (@id,@kind,@municipio,@jornada_id,@requirement_key,@attention_id,@channel,@recipient,@message,@created_at,@author)",
  ).run(row);
  return row;
}
export async function documentPDF(title: string, paragraphs: string[]) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page: any,
    y = 0;
  const safe = (s: string) => s.replace(/[^\x20-\x7e\u00a0-\u00ff]/g, "-");
  function newPage() {
    page = pdf.addPage([595, 842]);
    page.drawText("EIRA", {
      x: 44,
      y: 794,
      size: 24,
      font: bold,
      color: rgb(0.89, 0, 0.48),
    });
    page.drawText(title, { x: 44, y: 765, size: 13, font: bold });
    page.drawLine({
      start: { x: 44, y: 750 },
      end: { x: 551, y: 750 },
      thickness: 1,
    });
    const footer = [contact.slice(0, 101), contact.slice(101)];
    footer.forEach((s, i) =>
      page.drawText(safe(s), { x: 44, y: 40 - i * 11, size: 8, font }),
    );
    y = 724;
  }
  newPage();
  for (const paragraph of paragraphs) {
    let line = "";
    for (const word of safe(paragraph).split(/\s+/)) {
      if (font.widthOfTextAtSize(line + " " + word, 10) > 505 && line) {
        if (y < 85) newPage();
        page.drawText(line, { x: 44, y, size: 10, font });
        y -= 15;
        line = word;
      } else line += (line ? " " : "") + word;
    }
    if (y < 85) newPage();
    page.drawText(line, { x: 44, y, size: 10, font });
    y -= 26;
  }
  return Buffer.from(await pdf.save());
}
export function assertNeutral(message: string) {
  const plain = message
    .normalize("NFD")
    .replace(/[\u0300-\u036f\u200b-\u200f\ufeff]/g, "")
    .toLowerCase();
  if (
    message.length > 2500 ||
    /(papanic|citolog|resultad|positiv|negativ|v[\W_]*p[\W_]*h|cancer|diagnost|birads|lesion|tumor|biops|malign|oncolog|\bpap\b)/.test(
      plain,
    )
  )
    throw new SyncError(
      "El mensaje debe ser estrictamente neutral, sin términos clínicos",
    );
}
export function neutralMessage(link: string, expiry: string) {
  const message = `Hola, EIRA tiene un documento disponible para ti. Ingresa a {{enlace}} y verifica tu identidad. Vigente hasta ${expiry}. Si necesitas apoyo, contacta a EIRA.`;
  assertNeutral(message);
  return message.replace("{{enlace}}", link);
}
function managed(id: string) {
  const a = record("attentions", id);
  if (!a.pap_managed) throw new SyncError("Documento no encontrado", 404);
  return a;
}
export function listPAP(user: User, now = Date.now()) {
  requireRole(user, ["admin", "laboratorio", "consulta_clinica"]);
  return db
    .prepare(
      "SELECT * FROM attentions WHERE json_extract(data,'$.pap_managed')=1 ORDER BY updated_at DESC",
    )
    .all()
    .map(decode)
    .map((a) => {
      const patient = record("patients", a.paciente_uuid);
      const days = a.notificado_en
        ? Math.floor((now - Date.parse(a.notificado_en)) / 86400000)
        : null;
      const unread =
        !!a.notificado_en &&
        !a.leido_en &&
        now - Date.parse(a.notificado_en) > 48 * 3600000;
      return {
        ...a,
        patient,
        days_since: days,
        unread,
        assisted_eligible:
          !!patient.sin_conectividad_propia ||
          !patient.telefono ||
          !patient.email ||
          unread,
      };
    });
}
function checkIdentity(patient: any, checks: any) {
  if (
    !Array.isArray(checks) ||
    checks.length !== 2 ||
    new Set(checks.map((c: any) => c?.attribute)).size !== 2
  )
    throw new SyncError("Confirma dos atributos distintos");
  for (const c of checks) {
    if (
      ![
        "nombre_completo",
        "fecha_nacimiento",
        "telefono",
        "curp_opcional",
      ].includes(c.attribute) ||
      typeof c.value !== "string" ||
      !patient[c.attribute] ||
      normalize(c.value) !== normalize(String(patient[c.attribute]))
    )
      throw new SyncError("Los atributos de identidad no coinciden");
  }
  return checks.map((c: any) => c.attribute);
}
export function associatePAP(user: User, input: any) {
  requireRole(user, ["laboratorio"]);
  return db
    .transaction(() => {
      const p = record("patients", input.patientId);
      if (p.merged_into) throw new SyncError("Utiliza el expediente principal");
      const checked = checkIdentity(p, input.checks);
      const f = db
        .prepare(
          "SELECT f.*,l.purpose,l.owner,l.attention_id FROM files f JOIN file_links l ON l.file_id=f.id WHERE f.id=?",
        )
        .get(input.fileId) as any;
      if (
        !f ||
        f.mime !== "application/pdf" ||
        f.owner !== user.id ||
        f.purpose !== "pap" ||
        f.attention_id
      )
        throw new SyncError("PDF no disponible para asociación", 403);
      const previous = input.id ? managed(input.id) : null;
      if (
        previous &&
        (previous.estado_pap !== "Rechazado" || previous.paciente_uuid !== p.id)
      )
        throw new SyncError(
          "Solo se reemplaza un documento rechazado de la misma paciente",
        );
      let result;
      if (previous) {
        revokeAll(previous.id);
        result = change(
          "attentions",
          previous,
          {
            pdf_file_id: f.id,
            estado_pap: "Cargado",
            revision_nota: "",
            authorized_at: null,
            token_hash: null,
            expira_en: null,
            leido_en: null,
          },
          user,
          "reasociar_pdf",
        );
      } else {
        const id = "PAP-" + randomUUID();
        const latest = db
          .prepare(
            "SELECT data FROM attentions WHERE paciente_uuid=? ORDER BY updated_at DESC LIMIT 1",
          )
          .get(p.id) as any;
        const jornadaId = latest
          ? JSON.parse(latest.data).jornada_id
          : (
              db
                .prepare("SELECT id FROM jornadas ORDER BY id LIMIT 1")
                .get() as any
            ).id;
        result = save(
          "attentions",
          id,
          {
            paciente_uuid: p.id,
            jornada_id: jornadaId,
            programa: "Cérvix",
            categoria: "Estudio",
            tipo_servicio: "Documento PAP",
            fecha: new Date().toISOString().slice(0, 10),
            form_data: {},
            pap_managed: true,
            pdf_file_id: f.id,
            estado_pap: "Cargado",
            identity_checked: checked,
            leido_en: null,
          },
          1,
          user.id,
        );
        audit(user, "pap", "asociar_pdf", id, {
          paciente_uuid: p.id,
          file_id: f.id,
          atributos: checked,
        });
      }
      db.prepare("UPDATE file_links SET attention_id=? WHERE file_id=?").run(
        result.id,
        f.id,
      );
      return result;
    })
    .immediate();
}
function revokeAll(id: string) {
  db.prepare("UPDATE pap_tokens SET revoked=1 WHERE attention_id=?").run(id);
  db.prepare("DELETE FROM portal_sessions WHERE attention_id=?").run(id);
}
export function papAction(
  user: User,
  input: any,
  origin: string,
  now = Date.now(),
) {
  return db
    .transaction(() => {
      const a = managed(input.id);
      const p = record("patients", a.paciente_uuid);
      if (input.action === "review") {
        requireRole(user, ["admin"]);
        if (
          a.estado_pap !== "Cargado" ||
          input.identity !== true ||
          input.legible !== true
        )
          throw new SyncError(
            "Confirma identidad y legibilidad de un documento cargado",
          );
        return change(
          "attentions",
          a,
          {
            estado_pap: "Revisión Admin",
            reviewed_by: user.id,
            revision_nota: "",
          },
          user,
          "revision_admin",
        );
      }
      if (input.action === "reject") {
        requireRole(user, ["admin"]);
        if (!["Cargado", "Revisión Admin"].includes(a.estado_pap))
          throw new SyncError("El documento no está en revisión");
        revokeAll(a.id);
        return change(
          "attentions",
          a,
          {
            estado_pap: "Rechazado",
            revision_nota: text(input.note, 1500),
            authorized_at: null,
          },
          user,
          "rechazar",
        );
      }
      if (input.action === "authorize") {
        requireRole(user, ["consulta_clinica"]);
        if (a.estado_pap !== "Revisión Admin")
          throw new SyncError("Se requiere revisión administrativa previa");
        return change(
          "attentions",
          a,
          {
            estado_pap: "Autorizado Clínico",
            authorized_at: new Date(now).toISOString(),
            authorized_by: user.id,
          },
          user,
          "autorizar_clinico",
        );
      }
      requireRole(user, ["admin"]);
      if (input.action === "revoke") {
        revokeAll(a.id);
        return change(
          "attentions",
          a,
          {
            token_hash: null,
            expira_en: null,
            revocado_en: new Date(now).toISOString(),
          },
          user,
          "revocar_enlace",
        );
      }
      if (!a.authorized_at)
        throw new SyncError(
          "Se requiere autorización clínica antes de entregar o notificar",
          403,
        );
      if (["notify", "regenerate"].includes(input.action)) {
        if (input.action === "notify" && a.token_hash)
          throw new SyncError("Utiliza regenerar para reemplazar un enlace");
        if (
          !["Autorizado Clínico", "Notificado", "Consultado"].includes(
            a.estado_pap,
          )
        )
          throw new SyncError("Estado no notificable");
        if (input.message !== undefined)
          assertNeutral(text(input.message, 2500));
        const hours = input.hours === undefined ? 72 : Number(input.hours);
        if (!Number.isFinite(hours) || hours < 1 || hours > 168)
          throw new SyncError("Vigencia permitida: de 1 a 168 horas");
        const channel =
          input.channel === "email"
            ? "email"
            : input.channel === "sms"
              ? "sms"
              : null;
        const recipient = channel === "email" ? p.email : p.telefono;
        if (!channel || !recipient)
          throw new SyncError(
            "No hay contacto para ese canal; utiliza entrega asistida",
          );
        const raw = randomBytes(32).toString("base64url");
        const tokenHash = hash(raw),
          expiry = new Date(now + hours * 3600000).toISOString();
        const link = new URL("/resultado/" + raw, origin).toString();
        const preview = neutralMessage(link, expiry);
        revokeAll(a.id);
        db.prepare(
          "INSERT INTO pap_tokens(hash,attention_id,file_id,expires_at,created_at) VALUES (?,?,?,?,?)",
        ).run(
          tokenHash,
          a.id,
          a.pdf_file_id,
          Date.parse(expiry),
          new Date(now).toISOString(),
        );
        insertNotification(
          user,
          {
            kind: "document",
            attention_id: a.id,
            channel,
            recipient,
            message: neutralMessage("{{enlace_privado}}", expiry),
          },
          now,
        );
        const result = change(
          "attentions",
          a,
          {
            estado_pap: "Notificado",
            token_hash: tokenHash,
            expira_en: expiry,
            notificado_en: new Date(now).toISOString(),
            leido_en: null,
            revocado_en: null,
          },
          user,
          input.action === "notify" ? "notificar" : "regenerar_enlace",
        );
        return { record: result, preview, link, expires: expiry };
      }
      if (input.action === "assist") {
        const eligible =
          p.sin_conectividad_propia ||
          !p.telefono ||
          !p.email ||
          (a.notificado_en &&
            !a.leido_en &&
            now - Date.parse(a.notificado_en) > 48 * 3600000);
        if (
          !eligible ||
          !["Autorizado Clínico", "Notificado", "Consultado"].includes(
            a.estado_pap,
          )
        )
          throw new SyncError("Entrega asistida no disponible");
        if (
          !["impresión en sede", "acompañamiento", "contacto alterno"].includes(
            input.method,
          ) ||
          input.signed !== true
        )
          throw new SyncError("Registra método y firma de recibido");
        const when = date(input.date);
        if (when > new Date(now).toISOString().slice(0, 10))
          throw new SyncError("La entrega no puede ser futura");
        revokeAll(a.id);
        return change(
          "attentions",
          a,
          {
            estado_pap: "Entrega Asistida",
            entrega_asistida: {
              promotora: text(input.promotora, 150),
              metodo: input.method,
              fecha: when,
              firma_recibido: true,
              autor: user.id,
            },
            token_hash: null,
            expira_en: null,
          },
          user,
          "entrega_asistida",
        );
      }
      throw new SyncError("Acción desconocida");
    })
    .immediate();
}
function tokenRow(raw: string, now = Date.now()) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(raw)) return null;
  const t = db
    .prepare("SELECT * FROM pap_tokens WHERE hash=?")
    .get(hash(raw)) as any;
  return t && !t.revoked && !t.locked && t.expires_at > now ? t : null;
}
const visitor = { id: "portal", role: "paciente" };
export function portalAvailable(raw: string, now = Date.now()) {
  return !!tokenRow(raw, now);
}
export function verifyPortal(
  raw: string,
  method: string,
  value: unknown,
  now = Date.now(),
) {
  return db
    .transaction(() => {
      const t = tokenRow(raw, now);
      if (!t) {
        audit(visitor, "portal", "enlace_no_disponible", hash(raw), {});
        return {
          ok: false as const,
          status: 410,
          error: "Enlace no disponible. Solicita acompañamiento a EIRA.",
        };
      }
      const a = managed(t.attention_id),
        p = record("patients", a.paciente_uuid);
      const expected =
        method === "fecha_nacimiento"
          ? p.fecha_nacimiento
          : method === "telefono" &&
              String(p.telefono || "").replace(/\D/g, "").length >= 4
            ? String(p.telefono).replace(/\D/g, "").slice(-4)
            : "";
      const given =
        typeof value === "string" && value.length <= 100 ? value.trim() : "";
      const matches =
        !!expected &&
        hash(given).length === hash(expected).length &&
        timingSafeEqual(Buffer.from(hash(given)), Buffer.from(hash(expected)));
      if (!matches) {
        const attempts = t.attempts + 1;
        db.prepare(
          "UPDATE pap_tokens SET attempts=?,locked=? WHERE hash=?",
        ).run(attempts, attempts >= 5 ? 1 : 0, t.hash);
        audit(
          visitor,
          "portal",
          attempts >= 5 ? "bloqueo_identidad" : "identidad_fallida",
          a.id,
          { intento: attempts },
        );
        return {
          ok: false as const,
          status: attempts >= 5 ? 429 : 400,
          error:
            attempts >= 5
              ? "Enlace bloqueado. Contacta a EIRA para recibir apoyo."
              : "No pudimos verificar los datos. Revisa e intenta de nuevo.",
        };
      }
      const session = randomBytes(32).toString("base64url");
      db.prepare("INSERT INTO portal_sessions VALUES (?,?,?,?)").run(
        hash(session),
        t.hash,
        a.id,
        Math.min(now + 10 * 60000, t.expires_at),
      );
      audit(visitor, "portal", "identidad_verificada", a.id, {});
      return { ok: true as const, session, documentId: a.id };
    })
    .immediate();
}
export const documentCookie = (id: string) =>
  "eira_document_" + hash(id).slice(0, 16);
export function validatePortalSession(
  session: string | undefined,
  id: string,
  now = Date.now(),
) {
  const s =
    session &&
    (db
      .prepare(
        "SELECT s.*,t.file_id FROM portal_sessions s JOIN pap_tokens t ON t.hash=s.token_hash WHERE s.hash=? AND s.attention_id=? AND s.expires_at>? AND t.expires_at>? AND t.revoked=0 AND t.locked=0",
      )
      .get(hash(session), id, now, now) as any);
  if (!s)
    throw new SyncError("Verifica tu identidad para abrir este documento", 403);
  const a = managed(id);
  if (a.pdf_file_id !== s.file_id || a.token_hash !== s.token_hash)
    throw new SyncError("Documento no disponible", 403);
  return {
    attention: a,
    file: db.prepare("SELECT * FROM files WHERE id=?").get(s.file_id) as any,
  };
}
export function markConsulted(session: string, id: string) {
  return db
    .transaction(() => {
      const { attention: a } = validatePortalSession(session, id);
      if (!a.leido_en)
        change(
          "attentions",
          a,
          { leido_en: new Date().toISOString(), estado_pap: "Consultado" },
          visitor as User,
          "consultar_documento",
        );
    })
    .immediate();
}
export function authorizedFile(user: User, fileId: string) {
  const file = db.prepare("SELECT * FROM files WHERE id=?").get(fileId) as any;
  if (!file) throw new SyncError("Archivo no encontrado", 404);
  const link = db
    .prepare("SELECT * FROM file_links WHERE file_id=?")
    .get(fileId) as any;
  if (link?.purpose === "jornada") {
    scopedJornada(user, link.jornada_id);
    requireRole(user, ["admin", "municipio"]);
  } else {
    requireRole(user, ["admin", "consulta_clinica", "laboratorio"]);
    if (
      !link?.attention_id &&
      user.id !== file.updated_by &&
      user.role !== "admin"
    )
      throw new SyncError("Archivo no autorizado", 403);
  }
  return file;
}
let seedPromise: Promise<void> | undefined;
export function ensurePapSeed() {
  return (seedPromise ??= (async () => {
    if (db.prepare("SELECT value FROM settings WHERE key='phase3_seed'").get())
      return;
    const bytes = await documentPDF("DOCUMENTO SINTÉTICO · DEMOSTRACIÓN", [
      "Documento ficticio de EIRA. Sin validez clínica. No contiene información de una persona real.",
    ]);
    db.transaction(() => {
      if (
        db.prepare("SELECT value FROM settings WHERE key='phase3_seed'").get()
      )
        return;
      const admin = { id: "admin", role: "admin" };
      const max = (
        db
          .prepare(
            "SELECT MAX(CAST(SUBSTR(id,9) AS INTEGER)) n FROM patients WHERE id LIKE 'EIRA-MX-%'",
          )
          .get() as any
      ).n;
      const patientId = `EIRA-MX-${String((max || 0) + 1).padStart(3, "0")}`;
      save(
        "patients",
        patientId,
        {
          uuid: patientId,
          nombre_completo: "Elisa Demo Sin Teléfono",
          nombre_normalizado: "elisa demo sin telefono",
          fecha_nacimiento: "1975-05-14",
          telefono: "",
          email: "",
          municipio: "Zapotlán el Grande",
          sin_conectividad_propia: true,
        },
        1,
        "admin",
      );
      for (let i = 0; i < 3; i++) {
        const id = "PAP-DEMO-" + (i + 1),
          fileId = randomUUID(),
          path = join(filesDir, fileId + ".pdf");
        writeFileSync(path, bytes, { flag: "wx" });
        const timestamp = new Date(
          Date.now() - (i === 1 ? 60 : 1) * 3600000,
        ).toISOString();
        const tokenHash =
          i === 1 ? hash(randomBytes(32).toString("base64url")) : null;
        const expiry = new Date(
          Date.parse(timestamp) + 72 * 3600000,
        ).toISOString();
        if (tokenHash) {
          db.prepare(
            "INSERT INTO pap_tokens(hash,attention_id,file_id,expires_at,created_at) VALUES (?,?,?,?,?)",
          ).run(tokenHash, id, fileId, Date.parse(expiry), timestamp);
          insertNotification(
            admin as User,
            {
              kind: "document",
              attention_id: id,
              channel: "sms",
              recipient: record("patients", "EIRA-MX-002").telefono,
              message: neutralMessage("{{enlace_privado}}", expiry),
            },
            Date.parse(timestamp),
          );
        }
        db.prepare("INSERT INTO files VALUES (?,?,?,?,?,?,?,?)").run(
          fileId,
          "documento-sintetico.pdf",
          path,
          "application/pdf",
          bytes.length,
          1,
          timestamp,
          "laboratorio",
        );
        db.prepare("INSERT INTO file_links VALUES (?,?,?,?,?,?)").run(
          fileId,
          "pap",
          null,
          null,
          id,
          "laboratorio",
        );
        save(
          "attentions",
          id,
          {
            paciente_uuid:
              i === 2 ? patientId : i === 0 ? "EIRA-MX-001" : "EIRA-MX-002",
            jornada_id: "JOR-001",
            programa: "Cérvix",
            categoria: "Estudio",
            tipo_servicio: "Documento PAP sintético",
            fecha: timestamp.slice(0, 10),
            pap_managed: true,
            pdf_file_id: fileId,
            estado_pap:
              i === 0
                ? "Cargado"
                : i === 1
                  ? "Notificado"
                  : "Autorizado Clínico",
            authorized_at: i ? timestamp : null,
            notificado_en: i === 1 ? timestamp : null,
            token_hash: tokenHash,
            expira_en: tokenHash ? expiry : null,
            leido_en: null,
            form_data: {},
          },
          1,
          "admin",
        );
      }
      audit(admin, "pap", "seed", "phase3", {
        documentos: 3,
        paciente_sin_telefono: patientId,
      });
      db.prepare("INSERT INTO settings VALUES ('phase3_seed','1')").run();
    }).immediate();
  })());
}
