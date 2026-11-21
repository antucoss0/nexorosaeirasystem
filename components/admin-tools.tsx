"use client";
import { useCallback, useEffect, useState } from "react";
import {
  GitCompareArrows,
  RefreshCw,
  Download,
  Check,
  Users,
  ClipboardList,
  Database,
  AlertTriangle,
} from "lucide-react";
import { useConnectivity } from "./connectivity";
import { useRegistry } from "./registry";
import { localWrite } from "@/lib/local";
import { flattenPatch, fieldValue } from "@/lib/patches";
import { schemas } from "@/lib/clinical";
const display = (v: any) =>
  typeof v === "object" ? JSON.stringify(v, null, 2) : String(v ?? "Sin dato");
export function AdminConflicts() {
  const { db, online, sync, revision } = useConnectivity();
  const [data, setData] = useState<{ conflicts: any[]; pairs: any[] }>({
    conflicts: [],
    pairs: [],
  });
  const [choices, setChoices] = useState<
    Record<string, Record<string, string>>
  >({});
  const [message, setMessage] = useState("");
  const [confirmation, setConfirmation] = useState<any>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!online) return;
    try {
      const res = await fetch("/api/admin/conflicts");
      const body = await res.json();
      if (!res.ok) throw Error(body.error);
      setData(body);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar");
    }
  }, [online]);
  useEffect(() => {
    void load();
  }, [load, revision]);
  async function decision(patch: any) {
    if (!db) return;
    try {
      const queued =
        patch.action === "resolve_conflict"
          ? (await db.outbox.toArray()).find(
              (o) =>
                o.table === "decisions" &&
                o.patch.conflictId === patch.conflictId,
            )
          : undefined;
      await localWrite(
        db,
        "decisions",
        queued?.entityId || crypto.randomUUID(),
        patch,
      );
      setConfirmation(null);
      setMessage("Decisión humana guardada en la cola local.");
      if (online) {
        await sync();
        await load();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">CONTROL HUMANO · TRAZABILIDAD</span>
          <h1>Revisar antes de vincular.</h1>
          <p>
            Resuelve diferencias campo por campo y confirma las posibles
            duplicidades.
          </p>
        </div>
        <button disabled={!online} onClick={() => void load()}>
          <RefreshCw size={15} />
          Actualizar
        </button>
      </div>
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="error banner">
          {error}
        </p>
      )}
      <section className="panel">
        <div className="panel-heading">
          <h2>Conflictos de sincronización</h2>
          <span className="tag">{data.conflicts.length} pendientes</span>
        </div>
        {!data.conflicts.length ? (
          <div className="empty">
            <Check />
            <h3>Sin conflictos pendientes</h3>
            <p>
              {online
                ? "Los cambios compatibles se sincronizaron sin sobrescribir diferencias."
                : "Conéctate para actualizar la bandeja."}
            </p>
          </div>
        ) : (
          data.conflicts.map((c) => (
            <div className="conflict-card" key={c.id}>
              <div className="conflict-title">
                <h3>{c.entity_id}</h3>
                <span className="tag">
                  {c.table_name} · v{c.server?.version}
                </span>
              </div>
              <p className="subtle">
                {c.user_id} · {c.created_at}
              </p>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Campo</th>
                      <th>Valor local propuesto</th>
                      <th>Servidor actual</th>
                      <th>Conservar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(flattenPatch(c.client)).map(
                      ([key, value]) => (
                        <tr key={key}>
                          <td>{key}</td>
                          <td>
                            <pre>{display(value)}</pre>
                          </td>
                          <td>
                            <pre>{display(fieldValue(c.server, key))}</pre>
                          </td>
                          <td>
                            <label>
                              <select
                                aria-label={`Resolver ${c.id} ${key}`}
                                value={choices[c.id]?.[key] || ""}
                                onChange={(e) =>
                                  setChoices({
                                    ...choices,
                                    [c.id]: {
                                      ...choices[c.id],
                                      [key]: e.target.value,
                                    },
                                  })
                                }
                              >
                                <option value="">Elegir…</option>
                                <option
                                  value="client"
                                  disabled={
                                    key.startsWith("form_data.") &&
                                    schemas[c.server?.form_data?.kind]
                                      ?.flatMap((s) => s.fields)
                                      .some(
                                        (f) =>
                                          f.result &&
                                          key === `form_data.${f.key}` &&
                                          JSON.stringify(value) !==
                                            JSON.stringify(
                                              fieldValue(c.server, key),
                                            ),
                                      )
                                  }
                                >
                                  Valor local
                                </option>
                                <option value="server">Servidor</option>
                              </select>
                            </label>
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>
              <div className="form-actions">
                <button
                  className="primary"
                  disabled={
                    !Object.keys(flattenPatch(c.client)).every(
                      (k) => choices[c.id]?.[k],
                    )
                  }
                  onClick={() =>
                    void decision({
                      action: "resolve_conflict",
                      conflictId: c.id,
                      expectedVersion: c.server.version,
                      choices: choices[c.id],
                    })
                  }
                >
                  Confirmar resolución y auditar
                </button>
              </div>
            </div>
          ))
        )}
      </section>
      <section className="panel duplicates-panel">
        <div className="panel-heading">
          <div>
            <h2>Posibles expedientes duplicados</h2>
            <p>
              Nunca se vinculan automáticamente. Los UUID originales se
              conservan.
            </p>
          </div>
          <span className="tag">{data.pairs.length} pares</span>
        </div>
        {!data.pairs.length ? (
          <div className="empty">
            <Users />
            <h3>Sin pares pendientes</h3>
            <p>Las decisiones de personas distintas se recuerdan.</p>
          </div>
        ) : (
          data.pairs.map((pair) => (
            <article className="duplicate-pair" key={pair.a.id + pair.b.id}>
              <div className="comparison-grid">
                {[pair.a, pair.b].map((p) => (
                  <div key={p.id}>
                    <h3>{p.nombre_completo}</h3>
                    <span className="tag">{p.id}</span>
                    <p>
                      {p.fecha_nacimiento} · {p.municipio}
                    </p>
                    <p>
                      {p.telefono || "Sin teléfono"} ·{" "}
                      {p.curp_opcional || "Sin CURP"}
                    </p>
                    <a className="text-link" href={`/admin/pacientes/${p.id}`}>
                      Ver ficha →
                    </a>
                  </div>
                ))}
              </div>
              <p className="match-reasons">{pair.reasons.join(" · ")}</p>
              <div className="decision-actions">
                <button
                  className="primary"
                  onClick={() => setConfirmation(pair)}
                >
                  Vincular
                </button>
                <button
                  onClick={() =>
                    void decision({
                      action: "dismiss_duplicate",
                      patientId: pair.a.id,
                      otherId: pair.b.id,
                    })
                  }
                >
                  Son personas distintas
                </button>
              </div>
            </article>
          ))
        )}
      </section>
      {confirmation && (
        <div className="modal-backdrop">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="merge-title"
            className="comparison-modal compact-modal"
          >
            <div className="panel-heading">
              <h2 id="merge-title">Confirmar vínculo de expedientes</h2>
            </div>
            <div className="modal-body">
              <label>
                UUID que conservará el historial
                <select
                  aria-label="UUID a conservar"
                  value={confirmation.a.id}
                  onChange={(e) => {
                    if (e.target.value !== confirmation.a.id)
                      setConfirmation({
                        ...confirmation,
                        a: confirmation.b,
                        b: confirmation.a,
                      });
                  }}
                >
                  {[confirmation.a, confirmation.b].map((p: any) => (
                    <option key={p.id} value={p.id}>
                      {p.id} · {p.nombre_completo}
                    </option>
                  ))}
                </select>
              </label>
              <p>
                Se moverán todas las atenciones de{" "}
                <strong>{confirmation.b.id}</strong> a{" "}
                <strong>{confirmation.a.id}</strong>. El UUID de origen se
                conservará como alias, no se elimina. Esta decisión queda
                auditada.
              </p>
              <p className="error">
                Confirma la identidad con evidencia humana antes de continuar.
              </p>
              <div className="decision-actions">
                <button
                  className="primary"
                  onClick={() =>
                    void decision({
                      action: "merge_patients",
                      patientId: confirmation.a.id,
                      otherId: confirmation.b.id,
                    })
                  }
                >
                  Confirmar: es la misma persona
                </button>
                <button onClick={() => setConfirmation(null)}>Cancelar</button>
              </div>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
export function AuditViewer() {
  const { online } = useConnectivity();
  const [filters, setFilters] = useState<Record<string, string>>({
    usuario: "",
    rol: "",
    modulo: "",
    accion: "",
    entidad_id: "",
    fecha: "",
  });
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [queried, setQueried] = useState(false);
  const load = useCallback(async () => {
    if (!online) return;
    try {
      const res = await fetch(
        "/api/admin/audit?" + new URLSearchParams(filters),
      );
      const data = await res.json();
      if (!res.ok) throw Error(data.error);
      setRows(data.rows);
      setQueried(true);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar");
    }
  }, [online, filters]);
  useEffect(() => {
    void load();
  }, [load]);
  async function download() {
    try {
      const res = await fetch(
        "/api/admin/audit?" +
          new URLSearchParams({ ...filters, format: "csv" }),
      );
      if (!res.ok) throw Error("No se pudo exportar");
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = "bitacora-eira.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">BITÁCORA INMUTABLE</span>
          <h1>Cada decisión deja huella.</h1>
          <p>
            Consulta quién hizo qué, cuándo y sobre qué expediente. Sin edición
            ni eliminación.
          </p>
        </div>
        <button disabled={!online} onClick={() => void download()}>
          <Download size={16} />
          Exportar CSV filtrado
        </button>
      </div>
      <section className="panel audit-filter">
        <div className="form-grid">
          {Object.entries({
            usuario: "Usuario",
            rol: "Rol",
            modulo: "Módulo",
            accion: "Acción",
            entidad_id: "Entidad",
            fecha: "Fecha",
          }).map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                aria-label={`Filtrar ${label}`}
                type={key === "fecha" ? "date" : "text"}
                value={filters[key]}
                onChange={(e) =>
                  setFilters({ ...filters, [key]: e.target.value })
                }
              />
            </label>
          ))}
        </div>
      </section>
      {error && <p className="error banner">{error}</p>}
      <section className="panel">
        <div className="panel-heading">
          <h2>Registro de actividad</h2>
          <span className="tag">{rows.length} eventos</span>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {[
                  "Fecha",
                  "Usuario / Rol",
                  "Módulo",
                  "Acción",
                  "Entidad",
                  "Detalle",
                ].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.timestamp}</td>
                  <td>
                    {r.usuario}
                    <small className="block-subtle">{r.rol}</small>
                  </td>
                  <td>{r.modulo}</td>
                  <td>{r.accion}</td>
                  <td>{r.entidad_id}</td>
                  <td>
                    <details>
                      <summary>Ver detalle</summary>
                      <pre>{display(JSON.parse(r.detalle))}</pre>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && (
            <p className="empty">
              {queried
                ? "Sin eventos con estos filtros."
                : "Conéctate para consultar la bitácora."}
            </p>
          )}
        </div>
      </section>
    </>
  );
}
export function Dashboard() {
  const { patients, attentions } = useRegistry();
  const { pending, online, revision } = useConnectivity();
  const [conflicts, setConflicts] = useState<number | null>(null);
  useEffect(() => {
    if (online)
      fetch("/api/admin/conflicts")
        .then((r) => r.json())
        .then((d) => setConflicts(d.conflicts.length))
        .catch(() => setConflicts(null));
  }, [online, revision]);
  const stats = [
    [Users, "Pacientes únicas", patients.filter((p) => !p.merged_into).length],
    [ClipboardList, "Atenciones", attentions.length],
    [Database, "Pendientes de sincronizar", pending],
    [AlertTriangle, "Conflictos abiertos", conflicts ?? "—"],
  ] as const;
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">PANORAMA EIRA</span>
          <h1>Conectar para cuidar mejor.</h1>
          <p>
            Una vista del trabajo compartido, sin perder de vista a cada mujer.
          </p>
        </div>
        <a href="/campo" className="primary">
          Abrir Campo →
        </a>
      </div>
      <div className="stat-grid">
        {stats.map(([Icon, label, value]) => (
          <div className="stat-card" key={label}>
            <div>
              <span>{label}</span>
              <Icon size={20} />
            </div>
            <strong>{value}</strong>
            <small>
              {label === "Conflictos abiertos"
                ? "Bandeja del servidor"
                : "Datos de este dispositivo"}
            </small>
          </div>
        ))}
      </div>
      <div className="dashboard-links">
        {[
          ["/admin/pacientes", "Expedientes", "Consultar historias y estudios"],
          [
            "/admin/conflictos",
            "Revisión humana",
            "Resolver conflictos y posibles duplicados",
          ],
          [
            "/admin/bitacora",
            "Trazabilidad",
            "Consultar decisiones y exportar actividad",
          ],
        ].map(([url, title, note]) => (
          <a className="panel" href={url} key={url}>
            <h2>{title} →</h2>
            <p>{note}</p>
          </a>
        ))}
      </div>
    </>
  );
}
