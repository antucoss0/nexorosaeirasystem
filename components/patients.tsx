"use client";
import { useState } from "react";
import { Search, ArrowLeft, FileHeart, Users } from "lucide-react";
import { useRegistry, History, visitCount } from "./registry";
import { useConnectivity } from "./connectivity";
import { localWrite } from "@/lib/local";
import { normalized } from "@/lib/matching";
import { can, type User } from "@/lib/rbac";
export function Patients() {
  const { patients, attentions } = useRegistry();
  const [search, setSearch] = useState("");
  const q = normalized(search);
  const list = patients.filter(
    (p) =>
      !p.merged_into &&
      [
        p.id,
        p.nombre_completo,
        p.fecha_nacimiento,
        p.telefono,
        p.municipio,
        p.curp_opcional,
        ...(p.aliases || []),
      ].some((v) => normalized(v).includes(q)),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">EXPEDIENTE DIGITAL ÚNICO</span>
          <h1>Una mujer. Una historia.</h1>
          <p>Visitas, atenciones y estudios: separados para contar mejor.</p>
        </div>
        <a href="/campo" className="primary">
          Registrar visita →
        </a>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <h2>Directorio de pacientes · {list.length}</h2>
          <label className="search">
            <Search size={17} />
            <input
              aria-label="Buscar pacientes"
              placeholder="UUID, nombre, fecha, teléfono, municipio o CURP"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Paciente / UUID estable</th>
                <th>Municipio</th>
                <th>Visitas</th>
                <th>Atenciones</th>
                <th>Estudios</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((p) => {
                const items = attentions.filter(
                  (a) => a.paciente_uuid === p.id,
                );
                return (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.nombre_completo}</strong>
                      <small className="block-subtle">{p.id}</small>
                    </td>
                    <td>{p.municipio}</td>
                    <td>{visitCount(items)}</td>
                    <td>
                      {items.filter((a) => a.categoria !== "Estudio").length}
                    </td>
                    <td>
                      {items.filter((a) => a.categoria === "Estudio").length}
                    </td>
                    <td>
                      <a
                        className="text-link"
                        href={`/admin/pacientes/${encodeURIComponent(p.id)}`}
                      >
                        Abrir ficha →
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!list.length && (
            <div className="empty">
              <Users />
              <h3>Sin coincidencias</h3>
              <p>Prueba otro dato o sincroniza los expedientes.</p>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
export function PatientFicha({ id, user }: { id: string; user: User }) {
  const { db } = useConnectivity();
  const { patients } = useRegistry();
  const patient = patients.find((p) => p.id === id);
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const contactLabels: Record<string, string> = {
    telefono: "Teléfono",
    email: "Correo electrónico",
    contacto_alterno: "Contacto alterno",
    residencia: "Residencia",
    municipio: "Municipio",
    sin_conectividad_propia: "Sin conectividad propia",
  };
  if (!patient)
    return (
      <div className="panel empty">
        <h1>Expediente no disponible</h1>
        <p>Sincroniza para descargarlo en este dispositivo.</p>
        <a href="/admin/pacientes">Volver al directorio</a>
      </div>
    );
  if (patient.merged_into)
    return (
      <div className="panel empty">
        <h1>Expediente vinculado</h1>
        <p>
          Este UUID se conserva como alias. Su historial está en{" "}
          {patient.merged_into}.
        </p>
        <a className="primary" href={`/admin/pacientes/${patient.merged_into}`}>
          Abrir expediente principal
        </a>
      </div>
    );
  return (
    <>
      <a className="text-link back-link" href="/admin/pacientes">
        <ArrowLeft size={14} />
        Volver a expedientes
      </a>
      <div className="page-heading">
        <div>
          <span className="eyebrow">FICHA DE PACIENTE · {patient.id}</span>
          <h1>{patient.nombre_completo}</h1>
          <p>
            {patient.municipio} · Nacimiento: {patient.fecha_nacimiento} ·{" "}
            {patient.curp_opcional || "CURP no registrada"}
          </p>
        </div>
        <span className="tag">
          {patient.sync_status === "pending"
            ? "Pendiente de sincronizar"
            : patient.sync_status === "conflict"
              ? "Conflicto"
              : "Expediente único"}
        </span>
      </div>
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      <section className="panel ficha-contact">
        <div className="panel-heading">
          <h2>Contacto y acompañamiento</h2>
          {can(user.role, "patient_write") && (
            <button onClick={() => setEditing(!editing)}>
              {editing ? "Cancelar" : "Actualizar contacto"}
            </button>
          )}
        </div>
        {!editing ? (
          <div className="detail-grid">
            {Object.entries(contactLabels).map(([k, label]) => (
              <div key={k}>
                <small>{label}</small>
                <strong>
                  {typeof patient[k] === "boolean"
                    ? patient[k]
                      ? "Sí"
                      : "No"
                    : patient[k] || "Sin dato"}
                </strong>
              </div>
            ))}
          </div>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!db) return;
              const values = new FormData(e.currentTarget);
              const patch = Object.fromEntries(
                selected
                  .map((k) => [
                    k,
                    k === "sin_conectividad_propia"
                      ? values.get(k) === "on"
                      : String(values.get(k) || ""),
                  ])
                  .filter(([k, v]) => patient[k as string] !== v),
              );
              try {
                if (Object.keys(patch).length)
                  await localWrite(db, "patients", id, patch, "update");
                setMessage(
                  Object.keys(patch).length
                    ? "Solo los campos seleccionados y modificados se guardaron localmente."
                    : "Sin cambios para guardar.",
                );
                setEditing(false);
              } catch {
                setMessage("No se pudo guardar el contacto.");
              }
            }}
          >
            <div className="form-grid">
              {Object.entries(contactLabels).map(([k, label]) => (
                <div key={k}>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={selected.includes(k)}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? [...selected, k]
                            : selected.filter((v) => v !== k),
                        )
                      }
                    />
                    Actualizar {label.toLowerCase()}
                  </label>
                  <label>
                    {label}
                    <input
                      name={k}
                      aria-label={label}
                      disabled={!selected.includes(k)}
                      type={
                        k === "sin_conectividad_propia"
                          ? "checkbox"
                          : k === "email"
                            ? "email"
                            : "text"
                      }
                      defaultChecked={
                        k === "sin_conectividad_propia"
                          ? !!patient[k]
                          : undefined
                      }
                      defaultValue={
                        k === "sin_conectividad_propia"
                          ? undefined
                          : patient[k] || ""
                      }
                    />
                  </label>
                </div>
              ))}
            </div>
            <div className="form-actions">
              <button className="primary">Guardar campos seleccionados</button>
            </div>
          </form>
        )}
      </section>
      {["captura", "consulta_clinica", "admin"].includes(user.role) && (
        <section className="clinical-shortcuts">
          <div>
            <FileHeart size={22} />
            <h2>Nuevo estudio clínico</h2>
          </div>
          <a href={`/admin/pacientes/${id}/estudio/nuevo?tipo=mamaria`}>
            Revisión Mamaria →
          </a>
          <a href={`/admin/pacientes/${id}/estudio/nuevo?tipo=cervix`}>
            Citología Cervical →
          </a>
        </section>
      )}
      <History patientId={id} />
      {patient.aliases?.length > 0 && (
        <p className="care-note">
          UUID alias conservados: {patient.aliases.join(", ")}
        </p>
      )}
    </>
  );
}
