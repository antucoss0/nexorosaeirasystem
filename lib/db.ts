import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { hashSync } from "bcryptjs";
import { randomBytes } from "node:crypto";
const dir = process.env.DATA_DIR || join(process.cwd(), "data");
mkdirSync(join(dir, "files"), { recursive: true });
export const filesDir = join(dir, "files");
export const db = new Database(join(dir, "nexo.db"));
db.pragma("busy_timeout = 10000");
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.exec(`
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,nombre TEXT NOT NULL,role TEXT NOT NULL,municipio TEXT,password_hash TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS patients(id TEXT PRIMARY KEY,data TEXT NOT NULL,version INTEGER NOT NULL,updated_at TEXT NOT NULL,updated_by TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS jornadas(id TEXT PRIMARY KEY,data TEXT NOT NULL,version INTEGER NOT NULL,updated_at TEXT NOT NULL,updated_by TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS attentions(id TEXT PRIMARY KEY,paciente_uuid TEXT NOT NULL REFERENCES patients(id),data TEXT NOT NULL,version INTEGER NOT NULL,updated_at TEXT NOT NULL,updated_by TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS record_history(table_name TEXT,entity_id TEXT,version INTEGER,data TEXT NOT NULL,PRIMARY KEY(table_name,entity_id,version));
CREATE TABLE IF NOT EXISTS audit_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,timestamp TEXT NOT NULL,usuario TEXT NOT NULL,rol TEXT NOT NULL,modulo TEXT NOT NULL,accion TEXT NOT NULL,entidad_id TEXT NOT NULL,detalle TEXT NOT NULL);
CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit_logs BEGIN SELECT RAISE(ABORT,'append-only'); END;
CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit_logs BEGIN SELECT RAISE(ABORT,'append-only'); END;
CREATE TABLE IF NOT EXISTS conflicts(id TEXT PRIMARY KEY,table_name TEXT,entity_id TEXT,user_id TEXT,op_id TEXT,server_data TEXT,client_patch TEXT,fields TEXT,created_at TEXT);
CREATE TABLE IF NOT EXISTS applied_ops(op_id TEXT PRIMARY KEY,user_id TEXT NOT NULL,result TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS decisions(id TEXT PRIMARY KEY,data TEXT NOT NULL,version INTEGER NOT NULL,updated_at TEXT NOT NULL,updated_by TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS conflict_resolutions(conflict_id TEXT PRIMARY KEY,decision_id TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS files(id TEXT PRIMARY KEY,filename TEXT NOT NULL,path TEXT NOT NULL,mime TEXT NOT NULL,size INTEGER NOT NULL,version INTEGER NOT NULL,updated_at TEXT NOT NULL,updated_by TEXT NOT NULL);
`);
db.prepare("INSERT OR IGNORE INTO settings VALUES (?,?)").run(
  "jwt_secret",
  randomBytes(48).toString("hex"),
);
export const jwtSecret =
  process.env.SESSION_SECRET ||
  (
    db.prepare("SELECT value FROM settings WHERE key=?").get("jwt_secret") as {
      value: string;
    }
  ).value;
export const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
export function audit(
  user: { id: string; role: string },
  table: string,
  action: string,
  id: string,
  detail: unknown,
) {
  db.prepare(
    "INSERT INTO audit_logs(timestamp,usuario,rol,modulo,accion,entidad_id,detalle) VALUES (?,?,?,?,?,?,?)",
  ).run(
    new Date().toISOString(),
    user.id,
    user.role,
    table,
    action,
    id,
    JSON.stringify(detail),
  );
}
export function decode(row: any) {
  return row
    ? {
        ...JSON.parse(row.data),
        id: row.id,
        version: row.version,
        updated_at: row.updated_at,
        updated_by: row.updated_by,
      }
    : null;
}
export function save(
  table: string,
  id: string,
  data: Record<string, unknown>,
  version: number,
  user: string,
) {
  const now = new Date().toISOString();
  if (table === "attentions")
    db.prepare("INSERT OR REPLACE INTO attentions VALUES (?,?,?,?,?,?)").run(
      id,
      data.paciente_uuid,
      JSON.stringify(data),
      version,
      now,
      user,
    );
  else
    db.prepare(`INSERT OR REPLACE INTO ${table} VALUES (?,?,?,?,?)`).run(
      id,
      JSON.stringify(data),
      version,
      now,
      user,
    );
  db.prepare("INSERT INTO record_history VALUES (?,?,?,?)").run(
    table,
    id,
    version,
    JSON.stringify(data),
  );
  return decode(db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id));
}
const municipios = ["Zapotlán el Grande", "Tuxpan", "Gómez Farías"];
db.transaction(() => {
  if (db.prepare("SELECT id FROM users LIMIT 1").get()) return;
  for (const [name, role] of [
    ["brigadista", "captura"],
    ["medico", "consulta_clinica"],
    ["laboratorio", "laboratorio"],
    ["municipio", "municipio"],
    ["admin", "admin"],
  ])
    db.prepare("INSERT INTO users VALUES (?,?,?,?,?,?)").run(
      name,
      `${name}@eira.mx`,
      name,
      role,
      role === "municipio" ? municipios[0] : null,
      hashSync("eira2026", 10),
    );
  municipios.forEach((municipio, i) =>
    save(
      "jornadas",
      `JOR-00${i + 1}`,
      {
        municipio,
        sede:
          i === 0
            ? "Centro Comunitario · Ciudad Guzmán"
            : `Centro de Salud ${municipio}`,
        fecha: `2026-0${i + 6}-15`,
        servicios: ["Revisión mamaria", "Papanicolaou"],
        responsables: ["Equipo EIRA"],
        requisitos: [
          {
            clave: "carta",
            nombre: "Carta compromiso",
            estado: "pendiente",
            file_id: null,
            nota_correccion: "",
            historial: [],
          },
        ],
        versiones_carta: [],
        estado_general: "En preparación",
      },
      1,
      "admin",
    ),
  );
  const names = [
    "María Guadalupe López",
    "Maria Guadalupe Lopez Ruiz",
    "Ana Isabel García",
    "Ana Isabela Garcia",
    "Rosa Elena Pérez",
    "Carmen Díaz",
    "Lucía Hernández",
    "Patricia Torres",
    "Sofía Ramírez",
    "Elena Mendoza",
  ];
  names.forEach((nombre, i) => {
    const id = `EIRA-MX-${String(i + 1).padStart(3, "0")}`;
    save(
      "patients",
      id,
      {
        uuid: id,
        nombre_completo: nombre,
        nombre_normalizado: normalize(nombre),
        fecha_nacimiento: `198${i}-03-12`,
        telefono: `34112345${String(i).padStart(2, "0")}`,
        municipio: municipios[i % 3],
        curp_opcional: "",
        contacto_alterno: "",
        email: "",
        sin_conectividad_propia: i % 3 === 0,
        entidad_nacimiento: "Jalisco",
        residencia: "Jalisco",
        afiliacion: "Sin afiliación",
        sync_status: "synced",
      },
      1,
      "admin",
    );
  });
  for (let i = 0; i < 18; i++)
    save(
      "attentions",
      `AT-${i + 1}`,
      {
        paciente_uuid: `EIRA-MX-${String((i % 10) + 1).padStart(3, "0")}`,
        jornada_id: `JOR-00${(i % 3) + 1}`,
        programa: i % 2 ? "Cérvix" : "Mama",
        categoria: [
          "Servicio",
          "Atención",
          "Estudio",
          "Entrega de Insumos",
          "Participación",
        ][i % 5],
        tipo_servicio: i % 2 ? "Papanicolaou" : "Revisión mamaria",
        fecha: "2026-06-15",
        form_data: {},
        estado_pap: "pendiente",
        pdf_file_id: null,
        token_hash: null,
        expira_en: null,
        pin_method: null,
        leido_en: null,
      },
      1,
      "admin",
    );
  audit({ id: "admin", role: "admin" }, "sistema", "seed", "foundation", {
    patients: 10,
    attentions: 18,
    jornadas: 3,
  });
}).immediate();
db.transaction(() => {
  if (
    db
      .prepare("SELECT value FROM settings WHERE key=?")
      .get("phase2_demo_active")
  )
    return;
  const row = decode(
    db.prepare("SELECT * FROM jornadas WHERE id=?").get("JOR-001"),
  );
  if (row?.version === 1 && row.estado_general === "En preparación") {
    const { id, version, updated_at, updated_by, ...data } = row;
    save(
      "jornadas",
      id,
      { ...data, estado_general: "Activa" },
      version + 1,
      "admin",
    );
    audit({ id: "admin", role: "admin" }, "jornadas", "activar_demo", id, {
      estado_general: "Activa",
    });
  }
  db.prepare("INSERT INTO settings VALUES (?,?)").run(
    "phase2_demo_active",
    "1",
  );
}).immediate();
