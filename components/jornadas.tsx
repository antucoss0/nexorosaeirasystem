"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  CalendarDays,
  Plus,
  ShieldCheck,
  FileText,
  HeartHandshake,
  Bell,
} from "lucide-react";
import type { User } from "@/lib/rbac";
import { useConnectivity } from "./connectivity";
const services = [
  "Revisión mamaria",
  "Citología cervical",
  "Orientación preventiva",
  "Entrega de insumos",
];
const initial = () => ({
  municipio: "Zapotlán el Grande",
  sede: "",
  fecha: "",
  servicios: ["Revisión mamaria", "Citología cervical"],
  responsables: [{ nombre: "", rol: "Coordinación", contacto: "" }],
  persona_enlace: { nombre: "", contacto: "" },
  requisitos: [
    "Carta compromiso",
    "Fotografías del espacio",
    "Logotipos institucionales",
    "Persona enlace",
  ].map((nombre) => ({ nombre, critico: true })),
});
async function jsonRequest(url: string, body?: any) {
  const r = await fetch(
    url,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : undefined,
  );
  const d = await r.json();
  if (!r.ok) throw Error(d.error);
  return d;
}
export function Jornadas({ user }: { user: User }) {
  const { online, revision } = useConnectivity();
  const [data, setData] = useState<any>({
    jornadas: [],
    notifications: [],
    template: { clauses: [] },
  });
  const [selected, setSelected] = useState("");
  const [draft, setDraft] = useState<any>(initial);
  const [editor, setEditor] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const admin = user.role === "admin";
  const load = useCallback(async () => {
    if (!online) return;
    try {
      setData(await jsonRequest("/api/jornadas"));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [online]);
  useEffect(() => {
    void load();
  }, [load, revision]);
  const current =
    data.jornadas.find((j: any) => j.id === selected) || data.jornadas[0];
  async function action(body: any) {
    if (!online || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await jsonRequest("/api/jornadas", body);
      if (body.action === "save") {
        setEditor(false);
        setSelected(result.id);
      }
      setMessage(
        body.action === "remind"
          ? result.message
          : "Cambios guardados y auditados.",
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function upload(file: File | undefined, r: any) {
    if (!file || !online) return;
    setBusy(true);
    setError("");
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("jornadaId", current.id);
      fd.set("requirementKey", r.clave);
      const res = await fetch("/api/files", { method: "POST", body: fd });
      const b = await res.json();
      if (!res.ok) throw Error(b.error);
      setMessage(
        "Archivo recibido. El historial conserva las entregas anteriores.",
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">COORDINACIÓN COMUNITARIA</span>
          <h1>Preparar juntas, cuidar mejor.</h1>
          <p>
            Acuerdos claros, requisitos con seguimiento y recordatorios amables.
          </p>
        </div>
        {admin && (
          <button
            className="primary"
            disabled={!online}
            onClick={() => {
              setDraft(initial());
              setEditor(true);
            }}
          >
            <Plus size={16} />
            Nueva jornada
          </button>
        )}
      </div>
      {!online && (
        <p className="notice">
          Sin conexión. Las cargas, aprobaciones y cartas requieren conexión; no
          se enviarán solicitudes.
        </p>
      )}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="error banner" role="alert">
          {error}
        </p>
      )}
      {user.role === "municipio" && (
        <section className="notice reminder-banner">
          <Bell size={18} />
          <div>
            <strong>Tu municipio: {user.municipio}</strong>
            <p>
              {data.jornadas.reduce(
                (n: number, j: any) => n + j.traffic.pending,
                0,
              )}{" "}
              requisitos por completar. Revisa las notas de corrección cuando te
              sea posible.
            </p>
            {data.notifications.slice(0, 5).map((n: any) => (
              <p key={n.id}>
                {n.message} <small>{n.created_at.slice(0, 10)}</small>
              </p>
            ))}
          </div>
        </section>
      )}
      <section className="jornada-board" aria-label="Semáforo de jornadas">
        {[...new Set<string>(data.jornadas.map((j: any) => j.municipio))].map(
          (m) => (
            <div key={m} className="municipio-group">
              <h2>
                <CalendarDays size={17} />
                {m}
              </h2>
              <div className="jornada-cards">
                {data.jornadas
                  .filter((j: any) => j.municipio === m)
                  .map((j: any) => (
                    <button
                      key={j.id}
                      className={
                        "jornada-card " +
                        (current?.id === j.id ? "selected" : "")
                      }
                      onClick={() => {
                        setSelected(j.id);
                        setEditor(false);
                      }}
                    >
                      <span className={"traffic-pill " + j.traffic.color}>
                        {j.traffic.color} · {j.traffic.critical} pendientes
                        críticos
                      </span>
                      <strong>{j.sede}</strong>
                      <small>
                        {j.fecha} · {j.traffic.pending} requisitos pendientes
                      </small>
                    </button>
                  ))}
              </div>
            </div>
          ),
        )}
      </section>
      {editor ? (
        <form
          className="panel jornada-editor"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void action({ action: "save", data: draft });
          }}
        >
          <div className="panel-heading">
            <h2>{draft.id ? "Editar jornada" : "Crear jornada"}</h2>
            <button type="button" onClick={() => setEditor(false)}>
              Cancelar
            </button>
          </div>
          <div className="form-grid">
            {["municipio", "sede", "fecha"].map((k) => (
              <label key={k}>
                {k === "municipio"
                  ? "Municipio"
                  : k === "sede"
                    ? "Sede"
                    : "Fecha"}
                <input
                  aria-label={
                    k === "municipio"
                      ? "Municipio jornada"
                      : k === "sede"
                        ? "Sede jornada"
                        : "Fecha jornada"
                  }
                  required
                  type={k === "fecha" ? "date" : "text"}
                  value={draft[k]}
                  onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
                />
              </label>
            ))}
            <label>
              Servicios ofertados · selección múltiple
              <select
                aria-label="Servicios ofertados"
                multiple
                value={draft.servicios}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    servicios: Array.from(
                      e.target.selectedOptions,
                      (o) => o.value,
                    ),
                  })
                }
              >
                {[...new Set([...services, ...draft.servicios])].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              Persona enlace
              <input
                aria-label="Persona enlace"
                required
                value={draft.persona_enlace.nombre}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    persona_enlace: {
                      ...draft.persona_enlace,
                      nombre: e.target.value,
                    },
                  })
                }
              />
            </label>
            <label>
              Contacto enlace
              <input
                aria-label="Contacto enlace"
                required
                value={draft.persona_enlace.contacto}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    persona_enlace: {
                      ...draft.persona_enlace,
                      contacto: e.target.value,
                    },
                  })
                }
              />
            </label>
          </div>
          <div className="editor-block">
            <h3>Responsables</h3>
            {draft.responsables.map((r: any, i: number) => (
              <div className="responsable-row" key={i}>
                {["nombre", "rol", "contacto"].map((k) => (
                  <label key={k}>
                    {k}
                    <input
                      aria-label={`Responsable ${i + 1} ${k}`}
                      required
                      value={r[k]}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          responsables: draft.responsables.map(
                            (v: any, n: number) =>
                              n === i ? { ...v, [k]: e.target.value } : v,
                          ),
                        })
                      }
                    />
                  </label>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      responsables: draft.responsables.filter(
                        (_: any, n: number) => i !== n,
                      ),
                    })
                  }
                >
                  Quitar responsable
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                setDraft({
                  ...draft,
                  responsables: [
                    ...draft.responsables,
                    { nombre: "", rol: "", contacto: "" },
                  ],
                })
              }
            >
              Agregar responsable
            </button>
          </div>
          <div className="editor-block">
            <h3>Checklist configurable</h3>
            {draft.requisitos.map((r: any, i: number) => (
              <div className="requirement-editor" key={r.clave || i}>
                <label>
                  Requisito {i + 1}
                  <input
                    aria-label={`Requisito ${i + 1}`}
                    required
                    value={r.nombre}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        requisitos: draft.requisitos.map((v: any, n: number) =>
                          i === n ? { ...v, nombre: e.target.value } : v,
                        ),
                      })
                    }
                  />
                </label>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={r.critico !== false}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        requisitos: draft.requisitos.map((v: any, n: number) =>
                          n === i ? { ...v, critico: e.target.checked } : v,
                        ),
                      })
                    }
                  />
                  Crítico
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      requisitos: draft.requisitos.filter(
                        (_: any, n: number) => i !== n,
                      ),
                    })
                  }
                >
                  Quitar requisito
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                setDraft({
                  ...draft,
                  requisitos: [
                    ...draft.requisitos,
                    { nombre: "", critico: true },
                  ],
                })
              }
            >
              Agregar requisito personalizado
            </button>
          </div>
          <div className="form-actions">
            <button className="primary" disabled={!online || busy}>
              Guardar jornada
            </button>
          </div>
        </form>
      ) : (
        current && (
          <>
            <section className="panel jornada-detail">
              <div className="panel-heading">
                <div>
                  <h2>{current.sede}</h2>
                  <p>
                    {current.municipio} · {current.fecha}
                  </p>
                </div>
                {admin && (
                  <button
                    disabled={!online}
                    onClick={() => {
                      setDraft({
                        id: current.id,
                        version: current.version,
                        municipio: current.municipio,
                        sede: current.sede,
                        fecha: current.fecha,
                        servicios: current.servicios,
                        requisitos: current.requisitos.map((r: any) => ({
                          clave: r.clave,
                          nombre: r.nombre,
                          critico: r.critico !== false,
                        })),
                        responsables: (current.responsables || []).map(
                          (r: any) =>
                            typeof r === "string"
                              ? { nombre: r, rol: "Coordinación", contacto: "" }
                              : r,
                        ),
                        persona_enlace: current.persona_enlace || {
                          nombre: "",
                          contacto: "",
                        },
                      });
                      setEditor(true);
                    }}
                  >
                    Editar jornada
                  </button>
                )}
              </div>
              <div className="detail-grid">
                <div>
                  <small>Servicios</small>
                  <strong>{current.servicios.join(", ")}</strong>
                </div>
                <div>
                  <small>Persona enlace</small>
                  <strong>
                    {current.persona_enlace?.nombre || "Por definir"}
                  </strong>
                  <p>{current.persona_enlace?.contacto}</p>
                </div>
                <div>
                  <small>Responsables</small>
                  {current.responsables.map((r: any, i: number) => (
                    <p key={i}>
                      {typeof r === "string"
                        ? r
                        : `${r.nombre} · ${r.rol} · ${r.contacto}`}
                    </p>
                  ))}
                </div>
              </div>
              {current.requisitos.map((r: any) => (
                <article
                  className="requirement-card"
                  key={r.clave}
                  data-testid="requirement-card"
                >
                  <div className="requirement-title">
                    <h3>{r.nombre}</h3>
                    <span className={"tag state-" + r.estado}>{r.estado}</span>
                  </div>
                  {r.nota_correccion && (
                    <p className="correction-note">
                      Corrección solicitada: {r.nota_correccion}
                    </p>
                  )}
                  {r.file_id && (
                    <a href={`/api/files/${r.file_id}`} className="text-link">
                      Descargar archivo recibido →
                    </a>
                  )}
                  {["admin", "municipio"].includes(user.role) &&
                    r.estado !== "aprobado" && (
                      <label className="upload-label">
                        {r.estado === "observado"
                          ? "Volver a subir archivo"
                          : "Subir archivo"}{" "}
                        · PDF, PNG o JPEG, máximo 10 MB
                        <input
                          aria-label={`Archivo ${r.nombre}`}
                          type="file"
                          accept="application/pdf,image/png,image/jpeg"
                          disabled={!online || busy}
                          onChange={(e) => void upload(e.target.files?.[0], r)}
                        />
                      </label>
                    )}
                  {admin && (
                    <div className="requirement-actions">
                      <label>
                        Nota de corrección
                        <input
                          aria-label={`Nota ${r.nombre}`}
                          value={notes[r.clave] || ""}
                          onChange={(e) =>
                            setNotes({ ...notes, [r.clave]: e.target.value })
                          }
                        />
                      </label>
                      <button
                        disabled={!online || busy || !r.file_id}
                        onClick={() =>
                          void action({
                            action: "transition",
                            id: current.id,
                            key: r.clave,
                            state: "observado",
                            note: notes[r.clave],
                          })
                        }
                      >
                        Solicitar corrección
                      </button>
                      <button
                        className="primary"
                        disabled={
                          !online ||
                          busy ||
                          !r.file_id ||
                          r.estado === "aprobado"
                        }
                        onClick={() =>
                          void action({
                            action: "transition",
                            id: current.id,
                            key: r.clave,
                            state: "aprobado",
                          })
                        }
                      >
                        Aprobar requisito
                      </button>
                      <button
                        disabled={!online || busy || r.estado === "aprobado"}
                        onClick={() =>
                          void action({
                            action: "remind",
                            id: current.id,
                            key: r.clave,
                          })
                        }
                      >
                        Enviar recordatorio amable
                      </button>
                    </div>
                  )}
                  <details>
                    <summary>
                      Historial de entregas y revisiones (
                      {r.historial?.length || 0})
                    </summary>
                    {r.historial?.map((event: any, i: number) => (
                      <p key={i}>
                        {event.fecha} · {event.autor} · {event.de} → {event.a}{" "}
                        {event.nota}
                        {event.file_id && (
                          <>
                            {" "}
                            ·{" "}
                            <a href={`/api/files/${event.file_id}`}>Archivo</a>
                          </>
                        )}
                      </p>
                    ))}
                  </details>
                </article>
              ))}
            </section>
            <Carta
              key={current.id}
              j={current}
              template={data.template}
              admin={admin}
              disabled={!online || busy}
              generate={(variables) =>
                action({
                  action: "letter",
                  data: { jornadaId: current.id, variables },
                })
              }
            />
          </>
        )
      )}
      <p className="care-note">
        <HeartHandshake size={16} />
        Acompañamiento sin presión. Los recordatorios se limitan a uno por
        requisito cada 24 horas.
      </p>
    </>
  );
}
function Carta({
  j,
  template,
  admin,
  disabled,
  generate,
}: {
  j: any;
  template: any;
  admin: boolean;
  disabled: boolean;
  generate: (v: any) => Promise<void>;
}) {
  const [v, setV] = useState<any>({
    municipio: j.municipio,
    presidente: "",
    enlace: j.persona_enlace?.nombre || "",
    sede: j.sede,
    fecha: j.fecha,
    servicios: j.servicios,
    beneficiarias: 50,
  });
  return (
    <section className="panel carta-panel">
      <div className="panel-heading">
        <div>
          <h2>
            <FileText size={18} />
            Carta Compromiso
          </h2>
          <p>{template.version} · cláusulas institucionales protegidas</p>
        </div>
        <ShieldCheck size={23} />
      </div>
      <div className="fixed-clauses">
        <h3>Acuerdos fijos · solo lectura</h3>
        <ol>
          {template.clauses.map((c: string) => (
            <li key={c}>{c}</li>
          ))}
        </ol>
        <small>SHA-256: {template.hash}</small>
      </div>
      {admin && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void generate(v);
          }}
        >
          <div className="form-grid">
            {Object.entries({
              municipio: "Municipio carta",
              presidente: "Presidente/a municipal",
              enlace: "Persona enlace carta",
              sede: "Sede carta",
              fecha: "Fecha carta",
              beneficiarias: "Beneficiarias estimadas",
            }).map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  aria-label={label}
                  required
                  readOnly={key === "municipio"}
                  type={
                    key === "fecha"
                      ? "date"
                      : key === "beneficiarias"
                        ? "number"
                        : "text"
                  }
                  min={key === "beneficiarias" ? 1 : undefined}
                  value={v[key]}
                  onChange={(e) => setV({ ...v, [key]: e.target.value })}
                />
              </label>
            ))}
            <label>
              Servicios carta
              <select
                multiple
                aria-label="Servicios carta"
                value={v.servicios}
                onChange={(e) =>
                  setV({
                    ...v,
                    servicios: Array.from(
                      e.target.selectedOptions,
                      (o) => o.value,
                    ),
                  })
                }
              >
                {[...new Set<string>([...services, ...j.servicios])].map(
                  (s) => (
                    <option key={s}>{s}</option>
                  ),
                )}
              </select>
            </label>
          </div>
          <div className="form-actions">
            <button className="primary" disabled={disabled}>
              Generar carta v{(j.letters[0]?.version || 0) + 1}
            </button>
          </div>
        </form>
      )}
      <div className="letter-versions">
        {!j.letters.length && (
          <p className="subtle">Aún no hay versiones generadas.</p>
        )}
        {j.letters.map((l: any) => (
          <article key={l.id}>
            <strong>Carta v{l.version}</strong>
            <small>
              {l.author} · {l.created_at}
            </small>
            <a
              className="text-link"
              href={`/api/jornadas/${j.id}/cartas/${l.version}`}
            >
              Descargar PDF v{l.version}
            </a>
            <details>
              <summary>Variables y cambios de esta versión</summary>
              <pre>
                {JSON.stringify(
                  { variables: l.variables, cambios: l.diff },
                  null,
                  2,
                )}
              </pre>
            </details>
          </article>
        ))}
      </div>
    </section>
  );
}
