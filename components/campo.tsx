"use client";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Plus, Search, UserCheck, ArrowRight, ShieldCheck } from "lucide-react";
import { useConnectivity } from "./connectivity";
import { useRegistry, History } from "./registry";
import { candidates, normalized } from "@/lib/matching";
import { localWrite, type LocalRecord } from "@/lib/local";
const empty = {
  nombre_completo: "",
  fecha_nacimiento: "",
  telefono: "",
  municipio: "Zapotlán el Grande",
  curp_opcional: "",
  contacto_alterno: "",
  email: "",
};
const contacts = ["telefono", "email", "contacto_alterno"] as const;
export function Campo() {
  const { db } = useConnectivity();
  const { patients, jornadas } = useRegistry();
  const [draft, setDraft] = useState(empty);
  const [jornada, setJornada] = useState("");
  const [service, setService] = useState({
    categoria: "Atención",
    tipo_servicio: "Orientación de salud",
    programa: "Salud integral",
  });
  const [modal, setModal] = useState(false);
  const [selected, setSelected] = useState("");
  const [contactSelection, setContactSelection] = useState<string[]>([]);
  const [history, setHistory] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [prompted, setPrompted] = useState(false);
  const active = jornadas.filter((j) => j.estado_general === "Activa");
  const matches = useMemo(() => candidates(draft, patients), [draft, patients]);
  const candidate =
    matches.find((c) => c.patient.id === selected) || matches[0];
  useEffect(() => {
    if (!matches.length) {
      setPrompted(false);
      return;
    }
    if (prompted) return;
    const timer = setTimeout(() => {
      setSelected(matches[0].patient.id);
      setModal(true);
      setPrompted(true);
    }, 650);
    return () => clearTimeout(timer);
  }, [matches, prompted]);
  useEffect(() => {
    const change = (event: Event) => {
      const { from, to } = (event as CustomEvent).detail;
      setHistory((id) => (id === from ? to : id));
    };
    addEventListener("eira-remap", change);
    return () => removeEventListener("eira-remap", change);
  }, []);
  async function save(
    existing?: LocalRecord,
    decision?: "same_patient" | "different_patient",
  ) {
    if (!db || busy) return;
    setBusy(true);
    setError("");
    try {
      if (
        !existing &&
        (!draft.nombre_completo.trim() ||
          !draft.fecha_nacimiento ||
          !draft.municipio.trim())
      )
        throw Error(
          "Completa nombre, fecha de nacimiento y municipio antes de crear un UUID. Cierra la comparación para continuar capturando.",
        );
      const jornadaId = jornada || active[0]?.id;
      if (!jornadaId) throw Error("Selecciona una jornada disponible.");
      let id = existing?.id || "EIRA-TMP-" + crypto.randomUUID();
      await db.transaction(
        "rw",
        [db.patients, db.attentions, db.decisions, db.outbox],
        async () => {
          if (!existing)
            await localWrite(db, "patients", id, {
              ...draft,
              nombre_completo: draft.nombre_completo.trim(),
            });
          if (existing) {
            const patch = Object.fromEntries(
              contactSelection
                .filter((k) => draft[k as keyof typeof draft] !== existing[k])
                .map((k) => [k, draft[k as keyof typeof draft]]),
            );
            if (Object.keys(patch).length)
              await localWrite(db, "patients", id, patch, "update");
          }
          await localWrite(db, "attentions", "AT-" + crypto.randomUUID(), {
            ...service,
            paciente_uuid: id,
            jornada_id: jornadaId,
            fecha: new Date().toISOString().slice(0, 10),
            visit_id: crypto.randomUUID(),
            form_data: {},
          });
          if (decision)
            await localWrite(db, "decisions", crypto.randomUUID(), {
              action: decision,
              patientId: id,
              candidateIds: matches.map((m) => m.patient.id),
              note: "Decisión humana explícita en comparación de expedientes",
            });
        },
      );
      setHistory(id);
      setModal(false);
      setDraft(empty);
      setContactSelection([]);
      setPrompted(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setBusy(false);
    }
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (matches.length) {
      setSelected(matches[0].patient.id);
      setModal(true);
    } else void save();
  }
  return (
    <>
      <div className="page-kicker">
        <span className="eyebrow">CAPTURA EN CAMPO</span>
        <span className="phase-label">CUIDADO SIN BARRERAS</span>
      </div>
      <div className="page-heading">
        <div>
          <h1>Cada visita, una historia.</h1>
          <p>
            Busca coincidencias antes de registrar. Tú confirmas la identidad,
            nunca el sistema.
          </p>
        </div>
        <span className="tag">
          <ShieldCheck size={13} /> Guardado local primero
        </span>
      </div>
      <form className="panel capture-form" onSubmit={submit}>
        <div className="panel-heading">
          <h2>Paciente y atención recibida</h2>
          <span className="tag">
            {patients.filter((p) => !p.merged_into).length} expedientes locales
          </span>
        </div>
        <div className="form-grid">
          <label className="span-two">
            Jornada disponible
            <select
              required
              aria-label="Jornada activa"
              value={jornada || active[0]?.id || ""}
              onChange={(e) => setJornada(e.target.value)}
            >
              {!active.length && (
                <option value="">Sin jornadas disponibles · sincroniza</option>
              )}
              {active.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.municipio} · {j.sede} · {j.fecha} · {j.estado_general}
                </option>
              ))}
            </select>
          </label>
          {Object.entries({
            nombre_completo: "Nombre completo",
            fecha_nacimiento: "Fecha de nacimiento",
            telefono: "Teléfono",
            municipio: "Municipio",
            curp_opcional: "CURP (opcional)",
            contacto_alterno: "Contacto alterno",
            email: "Correo electrónico",
          }).map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                name={key}
                aria-label={label}
                type={
                  key === "fecha_nacimiento"
                    ? "date"
                    : key === "email"
                      ? "email"
                      : "text"
                }
                maxLength={180}
                required={[
                  "nombre_completo",
                  "fecha_nacimiento",
                  "municipio",
                ].includes(key)}
                value={draft[key as keyof typeof draft]}
                onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
              />
            </label>
          ))}
        </div>
        {matches.length > 0 && (
          <div className="match-notice" role="status">
            <Search size={20} />
            <div>
              <strong>{matches.length} posible(s) coincidencia(s)</strong>
              <p>
                {matches[0].patient.nombre_completo} ·{" "}
                {matches[0].reasons.join(", ")}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelected(matches[0].patient.id);
                setModal(true);
              }}
            >
              Comparar
            </button>
          </div>
        )}
        <div className="form-grid service-grid">
          <label>
            Categoría
            <select
              value={service.categoria}
              onChange={(e) =>
                setService({ ...service, categoria: e.target.value })
              }
            >
              {[
                "Servicio",
                "Atención",
                "Estudio",
                "Entrega de Insumos",
                "Participación",
              ].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            Tipo de servicio / insumo
            <input
              required
              name="tipo_servicio"
              value={service.tipo_servicio}
              onChange={(e) =>
                setService({ ...service, tipo_servicio: e.target.value })
              }
            />
          </label>
          <label>
            Programa
            <input
              required
              name="programa"
              value={service.programa}
              onChange={(e) =>
                setService({ ...service, programa: e.target.value })
              }
            />
          </label>
        </div>
        {error && (
          <p className="error banner" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button className="primary" disabled={busy}>
            <Plus size={17} />
            {matches.length
              ? "Revisar coincidencias y registrar"
              : "Registrar paciente y atención"}
          </button>
        </div>
      </form>
      {history && (
        <>
          <p className="notice" role="status">
            Visita guardada en el historial. Los cambios se sincronizarán al
            volver online.
          </p>
          <History patientId={history} />
        </>
      )}
      {modal && candidate && (
        <div className="modal-backdrop">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="compare-title"
            className="comparison-modal"
          >
            <div className="panel-heading">
              <div>
                <span className="eyebrow">CONFIRMACIÓN HUMANA OBLIGATORIA</span>
                <h2 id="compare-title">¿Es la misma paciente?</h2>
              </div>
              <button
                type="button"
                onClick={() => setModal(false)}
                aria-label="Cerrar comparación"
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <p>
                No fusionamos expedientes automáticamente. Compara los datos y
                confirma con la paciente.
              </p>
              {matches.length > 1 && (
                <label>
                  Candidata a comparar
                  <select
                    value={candidate.patient.id}
                    onChange={(e) => setSelected(e.target.value)}
                  >
                    {matches.map((c) => (
                      <option key={c.patient.id} value={c.patient.id}>
                        {c.patient.nombre_completo} · {c.patient.id}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="comparison-grid">
                <div>
                  <h3>Datos capturados</h3>
                  {Object.entries(draft).map(([k, v]) => (
                    <p key={k}>
                      <small>{k.replaceAll("_", " ")}</small>
                      <strong>{v || "Sin dato"}</strong>
                    </p>
                  ))}
                </div>
                <div>
                  <h3>Expediente existente</h3>
                  <span className="tag">{candidate.patient.id}</span>
                  {Object.keys(draft).map((k) => (
                    <p key={k}>
                      <small>{k.replaceAll("_", " ")}</small>
                      <strong>{candidate.patient[k] || "Sin dato"}</strong>
                    </p>
                  ))}
                </div>
              </div>
              <div className="match-reasons">
                {candidate.reasons.join(" · ")}
              </div>
              <fieldset>
                <legend>Actualizar solo los contactos seleccionados</legend>
                {contacts.map((k) => (
                  <label className="checkbox" key={k}>
                    <input
                      type="checkbox"
                      checked={contactSelection.includes(k)}
                      onChange={(e) =>
                        setContactSelection(
                          e.target.checked
                            ? [...contactSelection, k]
                            : contactSelection.filter((v) => v !== k),
                        )
                      }
                    />
                    {k.replaceAll("_", " ")}: {draft[k] || "(vacío)"}
                  </label>
                ))}
              </fieldset>
              <div className="decision-actions">
                <button
                  type="button"
                  className="primary"
                  disabled={busy}
                  onClick={() => void save(candidate.patient, "same_patient")}
                >
                  <UserCheck size={17} />
                  Confirmar misma paciente (Agregar visita al historial)
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void save(undefined, "different_patient")}
                >
                  Es otra persona (Crear nuevo UUID)
                  <ArrowRight size={16} />
                </button>
              </div>
              {error && (
                <p role="alert" className="error">
                  {error}
                </p>
              )}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
