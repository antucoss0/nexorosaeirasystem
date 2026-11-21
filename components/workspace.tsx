"use client";
import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowRight,
  Plus,
  Search,
  Check,
  MapPin,
  Users,
  ClipboardList,
  CalendarDays,
  ShieldCheck,
  Database,
  GitCompareArrows,
} from "lucide-react";
import { useConnectivity } from "./connectivity";
import { localWrite, type LocalRecord } from "@/lib/local";
import { can, type User } from "@/lib/rbac";
export function Workspace({
  section,
  user,
  entries = [],
}: {
  section: string;
  user: User;
  entries?: any[];
}) {
  const { db, revision, pending, online } = useConnectivity();
  const [patients, setPatients] = useState<LocalRecord[]>([]);
  const [attentions, setAttentions] = useState<LocalRecord[]>([]);
  const [jornadas, setJornadas] = useState<LocalRecord[]>([]);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState("");
  async function load() {
    if (!db) return;
    setPatients(await db.patients.toArray());
    setAttentions(await db.attentions.toArray());
    setJornadas(await db.jornadas.toArray());
  }
  useEffect(() => {
    void load();
  }, [db, revision]);
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!db) return;
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const id = "EIRA-TMP-" + crypto.randomUUID();
      await localWrite(db, "patients", id, {
        ...data,
        sin_conectividad_propia: data.sin_conectividad_propia === "on",
      });
      setMessage(
        "Expediente guardado en este dispositivo. Pendiente de sincronización.",
      );
      setShowForm(false);
      await load();
    } catch {
      setMessage(
        "No se pudo guardar. Revisa el almacenamiento del dispositivo.",
      );
    }
  }
  const titles: Record<string, [string, string]> = {
    campo: [
      "Tu brigada, conectada.",
      "Registra y acompaña a cada mujer, incluso sin conexión.",
    ],
    pacientes: [
      "Expedientes únicos",
      "Una historia por mujer. Todo su cuidado, en un mismo lugar.",
    ],
    jornadas: [
      "Jornadas que nos acercan",
      "Coordinación local para que el cuidado llegue más lejos.",
    ],
    conflictos: [
      "Conflictos de sincronización",
      "Las diferencias se revisan. Ninguna historia se sobrescribe.",
    ],
    bitacora: [
      "Bitácora de actividad",
      "Trazabilidad de cada cambio. Transparencia en cada decisión.",
    ],
    pap: ["Resultados PAP", "El cuidado continúa después de cada estudio."],
    impacto: [
      "Nuestro impacto",
      "Personas únicas, atenciones y comunidades. Sin doble conteo.",
    ],
  };
  const [title, subtitle] = titles[section] || titles.campo;
  const filtered = patients.filter((p) =>
    (p.nombre_completo + " " + p.id + " " + p.municipio)
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <>
      <div className="page-kicker">
        <span className="eyebrow">
          {section === "campo" ? "CAPTURA EN CAMPO" : "GESTIÓN EIRA"}
        </span>
        <span className="phase-label">FASE 01 · FUNDACIÓN</span>
      </div>
      <div className="page-heading">
        <div>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        {can(user.role, "patient_write") &&
          ["campo", "pacientes"].includes(section) && (
            <button
              className="primary"
              onClick={() => {
                setShowForm(!showForm);
                setMessage("");
              }}
            >
              <Plus size={18} />
              Nuevo expediente
            </button>
          )}
      </div>
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      {showForm && (
        <form className="capture-form panel" onSubmit={create}>
          <div className="panel-heading">
            <h2>Nuevo expediente</h2>
            <span className="tag">Guardado local primero</span>
          </div>
          <div className="form-grid">
            {[
              ["nombre_completo", "Nombre completo", "text"],
              ["fecha_nacimiento", "Fecha de nacimiento", "date"],
              ["telefono", "Teléfono", "tel"],
              ["email", "Correo electrónico", "email"],
              ["curp_opcional", "CURP (opcional)", "text"],
              ["contacto_alterno", "Contacto alterno", "text"],
              ["entidad_nacimiento", "Entidad de nacimiento", "text"],
              ["residencia", "Residencia", "text"],
              ["afiliacion", "Afiliación", "text"],
            ].map(([name, label, type]) => (
              <label key={name}>
                {label}
                <input
                  name={name}
                  type={type}
                  required={["nombre_completo", "fecha_nacimiento"].includes(
                    name,
                  )}
                  maxLength={200}
                />
              </label>
            ))}
            <label>
              Municipio
              <select name="municipio">
                <option>Zapotlán el Grande</option>
                <option>Tuxpan</option>
                <option>Gómez Farías</option>
              </select>
            </label>
          </div>
          <label className="checkbox">
            <input name="sin_conectividad_propia" type="checkbox" />
            Sin conectividad propia
          </label>
          <div className="form-actions">
            <button type="button" onClick={() => setShowForm(false)}>
              Cancelar
            </button>
            <button className="primary">
              <Check size={16} />
              Guardar en dispositivo
            </button>
          </div>
        </form>
      )}
      {["campo", "pacientes", "impacto"].includes(section) && (
        <div className="stat-grid">
          {[
            [
              Users,
              "Expedientes en dispositivo",
              patients.length,
              "Personas únicas",
            ],
            [
              ClipboardList,
              "Atenciones registradas",
              attentions.length,
              "Eventos de cuidado",
            ],
            [
              CalendarDays,
              "Jornadas disponibles",
              jornadas.length,
              "Comunidades conectadas",
            ],
            [
              Database,
              "Operaciones pendientes",
              pending,
              online ? "Listas para sincronizar" : "Guardadas de forma local",
            ],
          ].map(([Icon, label, value, note], i) => {
            const I = Icon as typeof Users;
            return (
              <div
                className={"stat-card " + (i === 0 ? "accent-card" : "")}
                key={String(label)}
              >
                <div>
                  <span>{String(label)}</span>
                  <I size={20} />
                </div>
                <strong>{String(value)}</strong>
                <small>{String(note)}</small>
              </div>
            );
          })}
        </div>
      )}
      {["campo", "pacientes"].includes(section) && (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>
                {section === "campo"
                  ? "Expedientes de tu comunidad"
                  : "Directorio de pacientes"}
              </h2>
              <p>Consulta local · {patients.length} expedientes disponibles</p>
            </div>
            <label className="search">
              <Search size={17} />
              <input
                aria-label="Buscar expediente"
                placeholder="Buscar nombre, ID o municipio"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Paciente / ID único</th>
                  <th>Municipio</th>
                  <th>Fecha de nacimiento</th>
                  <th>Sincronización</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div className="person">
                        <span className="person-avatar">
                          {p.nombre_completo
                            ?.split(" ")
                            .slice(0, 2)
                            .map((s: string) => s[0])
                            .join("")}
                        </span>
                        <div>
                          <strong>{p.nombre_completo}</strong>
                          <small>{p.id}</small>
                        </div>
                      </div>
                    </td>
                    <td>{p.municipio}</td>
                    <td>{p.fecha_nacimiento}</td>
                    <td>
                      <span
                        className={
                          "tag " +
                          (p.sync_status === "conflict" ? "tag-warning" : "")
                        }
                      >
                        {p.sync_status === "pending"
                          ? "Pendiente"
                          : p.sync_status === "conflict"
                            ? "Conflicto"
                            : "Sincronizado"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filtered.length && (
              <div className="empty">
                <Users size={28} />
                <h3>
                  {search ? "Sin coincidencias" : "Tu espacio está listo"}
                </h3>
                <p>
                  {search
                    ? "Prueba con otro nombre o municipio."
                    : "Sincroniza para descargar expedientes o registra el primero sin conexión."}
                </p>
              </div>
            )}
          </div>
          <div className="panel-bottom">
            <ShieldCheck size={15} />
            Datos sintéticos · Sin información de pacientes reales
            <span>{filtered.length} expedientes</span>
          </div>
        </section>
      )}
      {section === "jornadas" && (
        <div className="jornada-grid">
          {jornadas.map((j, i) => (
            <article className="panel jornada-card" key={j.id}>
              <div className="jornada-number">
                JORNADA / {String(i + 1).padStart(2, "0")}
                <span className="tag">{j.estado_general}</span>
              </div>
              <h2>{j.municipio}</h2>
              <p>
                <MapPin size={16} />
                {j.sede}
              </p>
              <p>
                <CalendarDays size={16} />
                {j.fecha}
              </p>
              <div className="service-tags">
                {j.servicios?.map((s: string) => (
                  <span key={s}>{s}</span>
                ))}
              </div>
              <div className="jornada-requirements">
                {j.requisitos?.map((r: any) => (
                  <div key={r.clave}>
                    <span>{r.nombre}</span>
                    <strong>{r.estado}</strong>
                  </div>
                ))}
              </div>
              <div className="panel-bottom">
                Coordinación municipal
                <ArrowRight size={16} />
              </div>
            </article>
          ))}
          {!jornadas.length && (
            <div className="panel empty">
              <CalendarDays />
              <h3>No hay jornadas locales</h3>
              <p>Sincroniza para descargar las jornadas de tu municipio.</p>
            </div>
          )}
        </div>
      )}
      {["conflictos", "bitacora"].includes(section) && (
        <section className="panel">
          <div className="panel-heading">
            <h2>
              {section === "conflictos"
                ? "Diferencias detectadas"
                : "Registro inmutable"}
            </h2>
            <span className="tag">{entries.length} registros</span>
          </div>
          {entries.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Entidad</th>
                    <th>Acción / Campos</th>
                    <th>Usuario</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((row) => (
                    <tr key={row.id}>
                      <td>{row.timestamp || row.created_at}</td>
                      <td>{row.entidad_id || row.entity_id}</td>
                      <td>{row.accion || row.fields}</td>
                      <td>{row.usuario || row.user_id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty">
              <GitCompareArrows size={30} />
              <h3>Todo en orden</h3>
              <p>No hay registros para mostrar.</p>
            </div>
          )}
        </section>
      )}
      {["pap", "impacto"].includes(section) && (
        <section className="panel foundation">
          <div className="foundation-icon">
            {section === "pap" ? (
              <ShieldCheck size={32} />
            ) : (
              <Users size={32} />
            )}
          </div>
          <span className="eyebrow">CONSTRUIMOS SOBRE UNA BASE SEGURA</span>
          <h2>
            {section === "pap"
              ? "El siguiente paso del cuidado."
              : "Cada persona cuenta. Una sola vez."}
          </h2>
          <p>
            {section === "pap"
              ? "La infraestructura de archivos y los permisos clínicos están preparados. El flujo de validación, autorización y entrega segura llegará en la siguiente fase."
              : "Los expedientes y las atenciones ya están separados. Los indicadores, filtros e importaciones se habilitarán en la siguiente fase."}
          </p>
          <span className="tag">Próximamente · Fase 02</span>
          {section === "impacto" && (
            <div className="sample-links">
              <a href="/samples/programa_mama.csv" download>
                Muestra CSV · Mama ↗
              </a>
              <a href="/samples/programa_cervix.csv" download>
                Muestra CSV · Cérvix ↗
              </a>
            </div>
          )}
        </section>
      )}
      <div className="care-note">
        <ShieldCheck size={18} />
        <span>
          <strong>El cuidado no se detiene sin internet.</strong> Tus registros
          se guardan primero en este dispositivo.
        </span>
      </div>
    </>
  );
}
