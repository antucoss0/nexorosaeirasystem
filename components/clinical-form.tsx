"use client";
import { useEffect, useState } from "react";
import { Printer, Save, ArrowLeft, LockKeyhole } from "lucide-react";
import { useConnectivity } from "./connectivity";
import { useRegistry } from "./registry";
import { localWrite } from "@/lib/local";
import {
  schemas,
  prefill,
  clinicalTitles,
  contactFooter,
} from "@/lib/clinical";
import { can, type User } from "@/lib/rbac";
export function ClinicalForm({
  patientId,
  attentionId,
  kind,
  user,
}: {
  patientId: string;
  attentionId: string;
  kind: string;
  user: User;
}) {
  const { db } = useConnectivity();
  const { patients, attentions, jornadas } = useRegistry();
  const patient = patients.find((p) => p.id === patientId);
  const existing = attentions.find((a) => a.id === attentionId);
  const actualKind = existing?.form_data?.kind || kind;
  const [values, setValues] = useState<Record<string, any>>({});
  const [initialized, setInitialized] = useState(false);
  const [message, setMessage] = useState("");
  const [savedId, setSavedId] = useState("");
  const [jornada, setJornada] = useState("");
  useEffect(() => {
    if (
      patient &&
      schemas[actualKind] &&
      !initialized &&
      (attentionId === "nuevo" || existing)
    ) {
      setValues(existing?.form_data || prefill(actualKind, patient));
      setInitialized(true);
      setJornada(
        existing?.jornada_id ||
          jornadas.find((j) => j.estado_general === "Activa")?.id ||
          "",
      );
    }
  }, [patient, existing, initialized, actualKind, attentionId, jornadas]);
  if (!patient || !schemas[actualKind])
    return (
      <div className="panel empty">
        <h1>Formulario no disponible</h1>
        <p>Sincroniza el expediente y selecciona un formulario válido.</p>
      </div>
    );
  const mayCapture = ["captura", "consulta_clinica", "admin"].includes(
    user.role,
  );
  const mayResults = can(user.role, "clinical_results");
  const editable = mayCapture || (!!existing && mayResults);
  async function save() {
    if (!db || !patient) return;
    setMessage("");
    try {
      const id = existing?.id || savedId || "AT-" + crypto.randomUUID();
      const old = existing?.form_data || {};
      const changed = Object.fromEntries(
        Object.entries(values).filter(
          ([k, v]) => JSON.stringify(old[k]) !== JSON.stringify(v),
        ),
      );
      if (!jornada) throw Error("Selecciona una jornada.");
      if (existing || savedId) {
        if (Object.keys(changed).length)
          await localWrite(
            db,
            "attentions",
            id,
            { form_data: { kind: actualKind, ...changed } },
            "update",
          );
      } else
        await localWrite(db, "attentions", id, {
          paciente_uuid: patient.id,
          jornada_id: jornada,
          programa: actualKind === "mamaria" ? "Mama" : "Cérvix",
          categoria: "Estudio",
          tipo_servicio: clinicalTitles[actualKind],
          fecha:
            values[actualKind === "mamaria" ? "f1" : "f19"] ||
            new Date().toISOString().slice(0, 10),
          visit_id: crypto.randomUUID(),
          form_data: { ...values, kind: actualKind },
        });
      setSavedId(id);
      setMessage(
        "Formulario guardado en el dispositivo. Listo para sincronizar e imprimir.",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "No se pudo guardar");
    }
  }
  return (
    <>
      <a
        className="text-link back-link no-print"
        href={`/admin/pacientes/${patientId}`}
      >
        <ArrowLeft size={14} />
        Volver a ficha
      </a>
      <div className="page-heading no-print">
        <div>
          <span className="eyebrow">ESTUDIO CLÍNICO · {patient.id}</span>
          <h1>{clinicalTitles[actualKind]}</h1>
          <p>
            {patient.nombre_completo} · Identificación precargada desde el
            expediente.
          </p>
        </div>
        <div className="button-row">
          {editable && (
            <button className="primary" onClick={() => void save()}>
              <Save size={16} />
              Guardar formulario
            </button>
          )}
          <button onClick={() => window.print()}>
            <Printer size={16} />
            Imprimir
          </button>
        </div>
      </div>
      {message && (
        <p className="notice no-print" role="status">
          {message}
        </p>
      )}
      <article className="clinical-document">
        <header className="clinical-doc-header">
          <div>
            <strong>EIRA</strong>
            <p>PREVENCIÓN Y DETECCIÓN OPORTUNA</p>
          </div>
          <div>
            <h2>{clinicalTitles[actualKind]}</h2>
            <p>
              {patient.nombre_completo} · {patient.id}
            </p>
          </div>
        </header>
        <div className="clinical-jornada no-print">
          <label>
            Jornada
            <select
              disabled={!!existing || !!savedId || !editable}
              value={jornada}
              onChange={(e) => setJornada(e.target.value)}
            >
              <option value="">Selecciona una jornada</option>
              {jornadas
                .filter(
                  (j) =>
                    j.estado_general === "Activa" ||
                    j.id === existing?.jornada_id,
                )
                .map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.sede} · {j.fecha}
                  </option>
                ))}
            </select>
          </label>
          {!mayResults && (
            <p>
              <LockKeyhole size={15} />
              Resultados reservados a Médico y Laboratorio.
            </p>
          )}
        </div>
        {schemas[actualKind].map((section) => (
          <section className="clinical-section" key={section.title}>
            <h3>{section.title}</h3>
            <div className="clinical-fields">
              {section.fields.map((field) => {
                const locked =
                  !editable ||
                  (field.result && !mayResults) ||
                  (user.role === "laboratorio" && !field.result);
                return (
                  <label
                    key={field.key}
                    className={
                      (field.type === "textarea" ? "wide-field " : "") +
                      (field.result ? "result-field" : "")
                    }
                  >
                    {field.label}
                    {field.result && (
                      <span className="result-lock">
                        {" "}
                        {locked ? "· Solo Médico / Laboratorio" : "· Resultado"}
                      </span>
                    )}
                    {field.options ? (
                      <select
                        aria-label={field.label}
                        name={field.key}
                        disabled={locked}
                        multiple={field.multi}
                        value={values[field.key] || (field.multi ? [] : "")}
                        onChange={(e) =>
                          setValues({
                            ...values,
                            [field.key]: field.multi
                              ? Array.from(
                                  e.target.selectedOptions,
                                  (o) => o.value,
                                )
                              : e.target.value,
                          })
                        }
                      >
                        {!field.multi && (
                          <option value="">Sin registrar</option>
                        )}
                        {field.options.map((v) => (
                          <option key={v}>{v}</option>
                        ))}
                      </select>
                    ) : field.type === "textarea" ? (
                      <textarea
                        aria-label={field.label}
                        name={field.key}
                        disabled={locked}
                        value={values[field.key] || ""}
                        onChange={(e) =>
                          setValues({ ...values, [field.key]: e.target.value })
                        }
                      />
                    ) : (
                      <input
                        aria-label={field.label}
                        name={field.key}
                        disabled={locked}
                        type={field.type || "text"}
                        value={values[field.key] || ""}
                        onChange={(e) =>
                          setValues({ ...values, [field.key]: e.target.value })
                        }
                      />
                    )}
                    <span className="print-value">
                      {(Array.isArray(values[field.key])
                        ? values[field.key].join("; ")
                        : values[field.key]) || "No registrado"}
                    </span>
                  </label>
                );
              })}
            </div>
          </section>
        ))}
        <footer className="clinical-footer">{contactFooter}</footer>
      </article>
    </>
  );
}
