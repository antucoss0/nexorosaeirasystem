"use client";
import { useEffect, useState } from "react";
import { liveQuery } from "dexie";
import { useConnectivity } from "./connectivity";
import type { LocalRecord } from "@/lib/local";
export function useRegistry() {
  const { db } = useConnectivity();
  const [state, setState] = useState<{
    patients: LocalRecord[];
    attentions: LocalRecord[];
    jornadas: LocalRecord[];
  }>({ patients: [], attentions: [], jornadas: [] });
  useEffect(() => {
    if (!db) return;
    const sub = liveQuery(async () => ({
      patients: await db.patients.toArray(),
      attentions: await db.attentions.toArray(),
      jornadas: await db.jornadas.toArray(),
    })).subscribe(setState);
    return () => sub.unsubscribe();
  }, [db]);
  return state;
}
export const visitCount = (items: LocalRecord[]) =>
  new Set(items.map((a) => a.visit_id || `${a.fecha}|${a.jornada_id}`)).size;
export function History({ patientId }: { patientId: string }) {
  const { attentions } = useRegistry();
  const items = attentions
    .filter((a) => a.paciente_uuid === patientId)
    .sort((a, b) =>
      (b.fecha + b.updated_at).localeCompare(a.fecha + a.updated_at),
    );
  return (
    <section className="panel history-panel">
      <div className="panel-heading">
        <div>
          <h2>Historial de la paciente</h2>
          <p data-testid="visit-count">
            {visitCount(items)} visitas · {items.length} atenciones ·{" "}
            {items.filter((a) => a.categoria === "Estudio").length} estudios
          </p>
        </div>
      </div>
      {!items.length ? (
        <p className="empty">Aún no hay atenciones registradas.</p>
      ) : (
        <ol className="timeline">
          {items.map((a) => (
            <li key={a.id}>
              <div>
                <strong>{a.tipo_servicio}</strong>
                <span className="tag">{a.categoria}</span>
              </div>
              <p>
                {a.fecha} · {a.programa} · {a.jornada_id}
              </p>
              <small>
                {a.sync_status === "pending"
                  ? "Pendiente de sincronizar"
                  : a.sync_status === "conflict"
                    ? "En conflicto"
                    : "Sincronizado"}
              </small>
              {a.form_data?.kind && (
                <a
                  className="text-link"
                  href={`/admin/pacientes/${encodeURIComponent(patientId)}/estudio/${encodeURIComponent(a.id)}`}
                >
                  Abrir / imprimir formulario →
                </a>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
