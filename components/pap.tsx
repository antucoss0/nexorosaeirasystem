"use client";
import { useCallback, useEffect, useState } from "react";
import {
  FileHeart,
  ShieldCheck,
  Upload,
  HeartHandshake,
  Clock,
  Send,
} from "lucide-react";
import { useConnectivity } from "./connectivity";
import { normalized } from "@/lib/matching";
import type { User } from "@/lib/rbac";
const states = [
  "Cargado",
  "Rechazado",
  "Revisión Admin",
  "Autorizado Clínico",
  "Notificado",
  "Consultado",
  "Entrega Asistida",
];
export function PapPanel({ user }: { user: User }) {
  const { online, revision } = useConnectivity();
  const [data, setData] = useState<any>({
    results: [],
    patients: [],
    notifications: [],
  });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [patientId, setPatientId] = useState("");
  const [identity, setIdentity] = useState({
    name: "",
    birth: "",
    confirmed: false,
  });
  const [file, setFile] = useState<File | null>(null);
  const [selected, setSelected] = useState("");
  const [filter, setFilter] = useState("");
  const [checked, setChecked] = useState({ identity: false, legible: false });
  const [note, setNote] = useState("");
  const [hours, setHours] = useState(72);
  const [channel, setChannel] = useState("sms");
  const [preview, setPreview] = useState<any>(null);
  const [assisted, setAssisted] = useState(false);
  const [receipt, setReceipt] = useState({
    promotora: "",
    method: "impresión en sede",
    date: new Date().toISOString().slice(0, 10),
    signed: false,
  });
  const admin = user.role === "admin";
  const lab = user.role === "laboratorio";
  const load = useCallback(async () => {
    if (!online) return;
    try {
      const res = await fetch("/api/pap");
      const d = await res.json();
      if (!res.ok) throw Error(d.error);
      setData(d);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [online]);
  useEffect(() => {
    void load();
  }, [load, revision]);
  const patient = data.patients.find((p: any) => p.id === patientId);
  const active =
    data.results.find((r: any) => r.id === selected) || data.results[0];
  const rows = data.results.filter(
    (r: any) =>
      (!filter || r.estado_pap === filter) &&
      (!search ||
        normalized(
          [
            r.id,
            r.patient.id,
            r.patient.nombre_completo,
            r.patient.fecha_nacimiento,
            r.patient.telefono,
          ].join(" "),
        ).includes(normalized(search))),
  );
  async function call(body: any) {
    const res = await fetch("/api/pap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await res.json();
    if (!res.ok) throw Error(d.error);
    return d;
  }
  async function action(action: string, extra: any = {}) {
    if (!online || busy || !active) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await call({ action, id: active.id, ...extra });
      if (result.preview) setPreview(result);
      setMessage("Acción completada y auditada.");
      setAssisted(false);
      setChecked({ identity: false, legible: false });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function synthetic() {
    if (!online) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/pap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "synthetic" }),
      });
      if (!res.ok) throw Error((await res.json()).error);
      setFile(
        new File([await res.blob()], "documento-sintetico.pdf", {
          type: "application/pdf",
        }),
      );
      setMessage(
        "PDF sintético listo. Confirma la identidad antes de asociarlo.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function associate() {
    if (!online || !file || !patient || !identity.confirmed) return;
    setBusy(true);
    setError("");
    try {
      const fd = new FormData();
      fd.set("file", file);
      const upload = await fetch("/api/files", { method: "POST", body: fd });
      const f = await upload.json();
      if (!upload.ok) throw Error(f.error);
      const r = await call({
        action: "associate",
        patientId: patient.id,
        fileId: f.id,
        ...(active?.estado_pap === "Rechazado" &&
        active.paciente_uuid === patient.id
          ? { id: active.id }
          : {}),
        checks: [
          { attribute: "nombre_completo", value: identity.name },
          { attribute: "fecha_nacimiento", value: identity.birth },
        ],
      });
      setSelected(r.id);
      setFile(null);
      setIdentity({ name: "", birth: "", confirmed: false });
      setMessage(
        "PDF asociado con dos atributos verificados. Estado: Cargado.",
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
          <span className="eyebrow">ENTREGA SEGURA</span>
          <h1>Documentos que llegan con cuidado.</h1>
          <p>
            Identidad verificada, revisión humana y autorización clínica antes
            de entregar.
          </p>
        </div>
        <FileHeart size={32} className="pink-icon" />
      </div>
      {!online && (
        <p className="notice">
          Este circuito seguro requiere conexión. No se enviarán solicitudes
          mientras estés offline.
        </p>
      )}
      {error && (
        <p className="error banner" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      <div className="pap-summary">
        <span>
          <ShieldCheck size={18} />
          Solo Médico autoriza
        </span>
        <span>
          <Clock size={18} />
          Enlace por 72 h · configurable
        </span>
        <span>
          <HeartHandshake size={18} />
          Acompañamiento cuando haga falta
        </span>
      </div>
      {lab && (
        <section className="panel pap-upload">
          <div className="panel-heading">
            <h2>
              <Upload size={18} />
              Cargar y asociar un PDF
            </h2>
            <button disabled={!online || busy} onClick={() => void synthetic()}>
              Generar PDF sintético
            </button>
          </div>
          <div className="form-grid">
            <label>
              Buscar paciente
              <input
                aria-label="Buscar paciente PAP"
                placeholder="Nombre, UUID, fecha o teléfono"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <label>
              Paciente
              <select
                aria-label="Paciente PAP"
                value={patientId}
                onChange={(e) => {
                  setPatientId(e.target.value);
                  setIdentity({ name: "", birth: "", confirmed: false });
                }}
              >
                <option value="">Selecciona un expediente</option>
                {data.patients
                  .filter(
                    (p: any) =>
                      !search ||
                      normalized(
                        [
                          p.id,
                          p.nombre_completo,
                          p.fecha_nacimiento,
                          p.telefono,
                        ].join(" "),
                      ).includes(normalized(search)),
                  )
                  .map((p: any) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre_completo} · {p.id}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              PDF escaneado · máximo 10 MB
              <input
                aria-label="PDF PAP"
                type="file"
                accept="application/pdf"
                disabled={!online || busy}
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
              {file && <small>Archivo listo: {file.name}</small>}
            </label>
          </div>
          {patient && (
            <div className="identity-confirm">
              <h3>Confirma dos atributos antes de asociar</h3>
              <div className="comparison-grid">
                <div>
                  <h3>Expediente de referencia</h3>
                  <p>
                    <small>Nombre</small>
                    <strong>{patient.nombre_completo}</strong>
                  </p>
                  <p>
                    <small>Fecha de nacimiento</small>
                    <strong>{patient.fecha_nacimiento}</strong>
                  </p>
                  <span className="tag">{patient.id}</span>
                </div>
                <div>
                  <h3>Datos del documento recibido</h3>
                  <label>
                    Nombre en el documento
                    <input
                      aria-label="Nombre documento"
                      required
                      value={identity.name}
                      onChange={(e) =>
                        setIdentity({
                          ...identity,
                          name: e.target.value,
                          confirmed: false,
                        })
                      }
                    />
                  </label>
                  <label>
                    Nacimiento en el documento
                    <input
                      aria-label="Nacimiento documento"
                      type="date"
                      required
                      value={identity.birth}
                      onChange={(e) =>
                        setIdentity({
                          ...identity,
                          birth: e.target.value,
                          confirmed: false,
                        })
                      }
                    />
                  </label>
                </div>
              </div>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={identity.confirmed}
                  onChange={(e) =>
                    setIdentity({ ...identity, confirmed: e.target.checked })
                  }
                />
                Confirmé ambos atributos contra el documento recibido
              </label>
            </div>
          )}
          <div className="form-actions">
            <button
              className="primary"
              disabled={
                !online || busy || !patient || !file || !identity.confirmed
              }
              onClick={() => void associate()}
            >
              Asociar documento
            </button>
          </div>
        </section>
      )}
      <section className="panel pap-table">
        <div className="panel-heading">
          <h2>Panel de estados · {rows.length} documentos</h2>
          <label>
            Estado
            <select
              aria-label="Filtrar estado PAP"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="">Todos los estados</option>
              {states.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          {!lab && (
            <label>
              Buscar
              <input
                aria-label="Buscar documento PAP"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
          )}
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Paciente / documento</th>
                <th>Estado</th>
                <th>Días desde notificación</th>
                <th>Seguimiento</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((a: any) => (
                <tr
                  key={a.id}
                  className={a.unread ? "unread-row" : ""}
                  data-testid="pap-row"
                >
                  <td>
                    <strong>{a.patient.nombre_completo}</strong>
                    <small className="block-subtle">
                      {a.paciente_uuid} · {a.id}
                    </small>
                  </td>
                  <td>
                    <span className="tag">{a.estado_pap}</span>
                  </td>
                  <td>{a.days_since ?? "—"}</td>
                  <td>
                    {a.unread ? (
                      <strong className="unread-flag">No leído &gt; 48h</strong>
                    ) : a.leido_en ? (
                      "Consultado el " + a.leido_en.slice(0, 10)
                    ) : (
                      "Seguimiento habitual"
                    )}
                    {a.assisted_eligible && (
                      <small className="block-subtle">
                        Entrega asistida disponible
                      </small>
                    )}
                  </td>
                  <td>
                    <button
                      onClick={() => {
                        setSelected(a.id);
                        setPreview(null);
                        setChecked({ identity: false, legible: false });
                        setAssisted(false);
                      }}
                    >
                      Gestionar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && (
            <p className="empty">Sin documentos con estos filtros.</p>
          )}
        </div>
      </section>
      {active && (
        <section className="panel pap-detail">
          <div className="panel-heading">
            <div>
              <h2>{active.patient.nombre_completo}</h2>
              <p>
                {active.id} · {active.estado_pap}
              </p>
            </div>
            <a href={`/api/files/${active.pdf_file_id}`} className="text-link">
              Abrir PDF para revisión →
            </a>
          </div>
          {active.revision_nota && (
            <p className="correction-note">
              Devolver a laboratorio: {active.revision_nota}
            </p>
          )}
          {active.entrega_asistida && (
            <p className="notice">
              Recibido por entrega asistida ·{" "}
              {active.entrega_asistida.promotora} ·{" "}
              {active.entrega_asistida.metodo} · {active.entrega_asistida.fecha}{" "}
              · firma de recibido registrada
            </p>
          )}
          {admin &&
            ["Cargado", "Revisión Admin"].includes(active.estado_pap) && (
              <div className="workflow-actions">
                <h3>Revisión administrativa</h3>
                <label className="checkbox">
                  <input
                    aria-label="Identidad revisada"
                    type="checkbox"
                    checked={checked.identity}
                    onChange={(e) =>
                      setChecked({ ...checked, identity: e.target.checked })
                    }
                  />
                  Identidad coincide con el expediente
                </label>
                <label className="checkbox">
                  <input
                    aria-label="Documento legible"
                    type="checkbox"
                    checked={checked.legible}
                    onChange={(e) =>
                      setChecked({ ...checked, legible: e.target.checked })
                    }
                  />
                  Documento completo y legible
                </label>
                <div className="button-row">
                  <button
                    className="primary"
                    disabled={
                      !online ||
                      busy ||
                      !checked.identity ||
                      !checked.legible ||
                      active.estado_pap !== "Cargado"
                    }
                    onClick={() => void action("review", checked)}
                  >
                    Confirmar revisión Admin
                  </button>
                </div>
                <label>
                  Nota para laboratorio
                  <input
                    aria-label="Nota rechazo PAP"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </label>
                <button
                  disabled={!online || busy || !note.trim()}
                  onClick={() => void action("reject", { note })}
                >
                  Devolver a laboratorio
                </button>
              </div>
            )}
          {user.role === "consulta_clinica" &&
            active.estado_pap === "Revisión Admin" && (
              <div className="workflow-actions">
                <p>
                  Revisa el PDF y la identidad antes de autorizar su entrega. La
                  revisión administrativa no sustituye el criterio clínico.
                </p>
                <button
                  className="primary"
                  disabled={!online || busy}
                  onClick={() => void action("authorize")}
                >
                  Autorizar clínicamente
                </button>
              </div>
            )}
          {admin &&
            active.authorized_at &&
            ["Autorizado Clínico", "Notificado", "Consultado"].includes(
              active.estado_pap,
            ) && (
              <div className="workflow-actions">
                <h3>
                  <Send size={17} />
                  Notificación neutral · simulación
                </h3>
                <p>
                  No incluye nombres de estudios, hallazgos ni información
                  clínica. El enlace se muestra una sola vez, sin guardarlo en
                  texto plano.
                </p>
                <div className="form-grid">
                  <label>
                    Canal
                    <select
                      aria-label="Canal notificación"
                      value={channel}
                      onChange={(e) => setChannel(e.target.value)}
                    >
                      <option value="sms">SMS</option>
                      <option value="email">Email</option>
                    </select>
                  </label>
                  <label>
                    Vigencia en horas
                    <input
                      aria-label="Vigencia horas"
                      type="number"
                      min="1"
                      max="168"
                      value={hours}
                      onChange={(e) => setHours(Number(e.target.value))}
                    />
                  </label>
                </div>
                <blockquote>
                  Hola, EIRA tiene un documento disponible para ti. Ingresa a
                  [enlace privado] y verifica tu identidad. Vigente hasta
                  [fecha].
                </blockquote>
                <div className="button-row">
                  <button
                    className="primary"
                    disabled={!online || busy}
                    onClick={() =>
                      void action(active.token_hash ? "regenerate" : "notify", {
                        channel,
                        hours,
                      })
                    }
                  >
                    {active.token_hash
                      ? "Regenerar enlace y notificar"
                      : "Notificar documento"}
                  </button>
                  {active.token_hash && (
                    <button
                      disabled={!online || busy}
                      onClick={() => void action("revoke")}
                    >
                      Revocar enlace
                    </button>
                  )}
                  {active.assisted_eligible && (
                    <button
                      disabled={!online || busy}
                      onClick={() => setAssisted(true)}
                    >
                      Entrega asistida
                    </button>
                  )}
                </div>
              </div>
            )}
          {preview && (
            <div className="message-preview">
              <h3>Vista previa del mensaje simulado</h3>
              <p>{preview.preview}</p>
              <a
                href={preview.link}
                target="_blank"
                rel="noreferrer"
                data-testid="portal-link"
              >
                Abrir enlace privado de demostración →
              </a>
              <small>
                Copia el enlace ahora si lo necesitas. La bandeja conserva el
                texto con el enlace oculto; regenerar revoca cualquier enlace
                anterior.
              </small>
            </div>
          )}
          {assisted && (
            <form
              className="assisted-form workflow-actions"
              onSubmit={(e) => {
                e.preventDefault();
                void action("assist", receipt);
              }}
            >
              <h3>Registrar entrega asistida</h3>
              <div className="form-grid">
                <label>
                  Nombre de promotora
                  <input
                    aria-label="Nombre promotora"
                    required
                    value={receipt.promotora}
                    onChange={(e) =>
                      setReceipt({ ...receipt, promotora: e.target.value })
                    }
                  />
                </label>
                <label>
                  Método
                  <select
                    aria-label="Método entrega"
                    value={receipt.method}
                    onChange={(e) =>
                      setReceipt({ ...receipt, method: e.target.value })
                    }
                  >
                    {[
                      "impresión en sede",
                      "acompañamiento",
                      "contacto alterno",
                    ].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Fecha de entrega
                  <input
                    aria-label="Fecha entrega"
                    type="date"
                    required
                    value={receipt.date}
                    onChange={(e) =>
                      setReceipt({ ...receipt, date: e.target.value })
                    }
                  />
                </label>
                <label className="checkbox">
                  <input
                    aria-label="Firma de recibido"
                    required
                    type="checkbox"
                    checked={receipt.signed}
                    onChange={(e) =>
                      setReceipt({ ...receipt, signed: e.target.checked })
                    }
                  />
                  Firma de recibido confirmada
                </label>
              </div>
              <button className="primary" disabled={!online || busy}>
                Confirmar entrega asistida
              </button>
            </form>
          )}
        </section>
      )}
      {admin && (
        <section className="panel notification-list">
          <div className="panel-heading">
            <h2>Bandeja de notificaciones simuladas</h2>
            <span className="tag">Sin envío real</span>
          </div>
          {data.notifications.map((n: any) => (
            <article key={n.id}>
              <strong>
                {n.channel.toUpperCase()} · {n.recipient}
              </strong>
              <p>{n.message}</p>
              <small>{n.created_at}</small>
            </article>
          ))}
          {!data.notifications.length && (
            <p className="empty">Todavía no hay mensajes emitidos.</p>
          )}
        </section>
      )}
    </>
  );
}
