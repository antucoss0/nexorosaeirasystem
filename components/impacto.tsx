"use client";
import { useCallback, useEffect, useState } from "react";
import {
  Upload,
  ChartNoAxesCombined,
  BookOpen,
  ShieldCheck,
  Download,
  Users,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { dictionary, fields, categories } from "@/lib/impact-model";
import { useConnectivity } from "./connectivity";
const labels: Record<string, string> = {
  nombre: "Nombre completo",
  fecha_nacimiento: "Fecha de nacimiento",
  telefono: "Teléfono",
  curp: "CURP",
  municipio: "Municipio",
  programa: "Programa",
  categoria: "Categoría",
  tipo_servicio: "Tipo de servicio",
  fecha: "Fecha de actividad",
  cantidad: "Cantidad",
  unidad: "Unidad",
  fuente: "Fuente",
};
export function Impacto() {
  const { online, revision } = useConnectivity();
  const [view, setView] = useState("import");
  const [batch, setBatch] = useState<any>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [defaults, setDefaults] = useState<Record<string, string>>({});
  const [choices, setChoices] = useState<
    Record<string, Record<string, string>>
  >({});
  const [persons, setPersons] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [source, setSource] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<any>(null);
  const [reason, setReason] = useState("");
  const [report, setReport] = useState<any>(null);
  const [batches, setBatches] = useState<any[]>([]);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const params = new URLSearchParams(
    Object.entries(filters).filter(([, v]) => v),
  );
  const load = useCallback(async () => {
    if (!online) return;
    try {
      const res = await fetch(
        "/api/impacto?" +
          new URLSearchParams(Object.entries(filters).filter(([, v]) => v)),
      );
      const body = await res.json();
      if (!res.ok) throw Error(body.error);
      setReport(body.report);
      setBatches(body.batches);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [online, filters]);
  useEffect(() => {
    void load();
  }, [load, revision]);
  function install(b: any) {
    setBatch(b);
    setMapping(b.mapping);
    setDefaults(b.defaults);
    setChoices(Object.fromEntries(b.rows.map((r: any) => [r.id, r.decisions])));
    setPersons(
      Object.fromEntries(b.rows.map((r: any) => [r.id, r.person_choice || ""])),
    );
    setDirty(false);
  }
  async function act(body: any) {
    if (!online || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/impacto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const b = await res.json();
      if (!res.ok) throw Error(b.error);
      install(b);
      setMessage(
        body.action === "consolidate"
          ? "Lote consolidado. Personas vinculadas sin duplicar expedientes."
          : "Acción guardada y auditada.",
      );
      if (body.action === "adjust") {
        setEdit(null);
        setReason("");
      }
      if (body.action === "consolidate") {
        await load();
        setView("metrics");
      }
      return b;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function upload(file: File | undefined) {
    if (!online || !file) return;
    setBusy(true);
    setError("");
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("source", source || file.name);
      const res = await fetch("/api/impacto", { method: "POST", body: fd });
      const b = await res.json();
      if (!res.ok) throw Error(b.error);
      install(b);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const counts: Record<string, number> = {};
  batch?.rows.forEach((r: any) =>
    r.anomalies.forEach(
      (a: any) => (counts[a.rule] = (counts[a.rule] || 0) + 1),
    ),
  );
  const ready = batch?.rows.every(
    (r: any) =>
      r.person_choice &&
      r.anomalies.every((a: any) =>
        ["aceptar", "excluir"].includes(r.decisions[a.rule]),
      ),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">EVIDENCIA PARA DECIDIR</span>
          <h1>Una persona, un impacto que cuenta.</h1>
          <p>
            Consolidar fuentes sin confundir personas con servicios ni estudios.
          </p>
        </div>
        <ChartNoAxesCombined className="pink-icon" size={32} />
      </div>
      <div className="impact-tabs">
        {[
          ["import", "Importar fuentes", Upload],
          ["metrics", "Indicadores", ChartNoAxesCombined],
          ["dictionary", "Diccionario de datos", BookOpen],
        ].map(([key, title, Icon]: any) => (
          <button
            key={key}
            className={view === key ? "active" : ""}
            onClick={() => setView(key)}
          >
            <Icon size={16} />
            {title}
          </button>
        ))}
      </div>
      {!online && (
        <p className="notice">
          La importación requiere conexión. No se enviarán solicitudes mientras
          estés offline.
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
      {view === "import" && (
        <>
          <section className="panel source-panel">
            <div className="panel-heading">
              <h2>1 · Elegir una fuente</h2>
              <span className="tag">CSV / XLSX · máximo 5 MB</span>
            </div>
            <div className="source-actions">
              <p>
                Los archivos se conservan en staging. No se crean expedientes
                clínicos ni se fusionan personas automáticamente.
              </p>
              <div className="button-row">
                {[1, 2].map((n) => (
                  <button
                    key={n}
                    disabled={!online || busy}
                    onClick={() => void act({ action: "sample", sample: n })}
                  >
                    Cargar fuente sintética {n}
                  </button>
                ))}
              </div>
              <div className="form-grid">
                <label>
                  Nombre de fuente
                  <input
                    aria-label="Nombre de fuente"
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                    placeholder="Identifica el origen para reutilizar su mapeo"
                  />
                </label>
                <label>
                  Subir archivo
                  <input
                    aria-label="Archivo de impacto"
                    type="file"
                    accept=".csv,.xlsx"
                    disabled={!online || busy}
                    onChange={(e) => void upload(e.target.files?.[0])}
                  />
                </label>
                <label>
                  Retomar lote
                  <select
                    aria-label="Retomar lote"
                    value={batch?.id || ""}
                    disabled={!online || busy}
                    onChange={async (e) => {
                      if (!e.target.value) return;
                      try {
                        const r = await fetch(
                          "/api/impacto?batch=" + e.target.value,
                        );
                        const b = await r.json();
                        if (!r.ok) throw Error(b.error);
                        install(b);
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                  >
                    <option value="">Selecciona un lote guardado</option>
                    {batches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.source} · {b.state} · {b.created_at.slice(0, 16)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          </section>
          {batch?.state === "mapping" && (
            <section className="panel mapping-panel">
              <div className="panel-heading">
                <div>
                  <h2>2 · Confirmar mapeo de columnas</h2>
                  <p>
                    {batch.source} · {batch.rows.length} filas · sugerencias
                    editables
                  </p>
                </div>
                <ShieldCheck size={20} />
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void act({ action: "map", id: batch.id, mapping, defaults });
                }}
              >
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Modelo común</th>
                        <th>Columna de origen</th>
                        <th>Valor fijo si no hay columna</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fields.map((key) => (
                        <tr key={key}>
                          <td>
                            <strong>{labels[key]}</strong>
                            <small className="block-subtle">{key}</small>
                          </td>
                          <td>
                            <select
                              aria-label={`Mapeo ${key}`}
                              value={mapping[key] || ""}
                              onChange={(e) =>
                                setMapping({
                                  ...mapping,
                                  [key]: e.target.value,
                                })
                              }
                            >
                              <option value="">
                                Sin columna · usar valor fijo
                              </option>
                              {batch.headers.map((h: string) => (
                                <option key={h}>{h}</option>
                              ))}
                            </select>
                          </td>
                          <td>
                            {key === "categoria" ? (
                              <select
                                aria-label={`Valor ${key}`}
                                disabled={!!mapping[key]}
                                value={defaults[key] || ""}
                                onChange={(e) =>
                                  setDefaults({
                                    ...defaults,
                                    [key]: e.target.value,
                                  })
                                }
                              >
                                <option value="">Sin valor</option>
                                {categories.map((c) => (
                                  <option key={c}>{c}</option>
                                ))}
                              </select>
                            ) : (
                              <input
                                aria-label={`Valor ${key}`}
                                value={defaults[key] || ""}
                                disabled={!!mapping[key]}
                                onChange={(e) =>
                                  setDefaults({
                                    ...defaults,
                                    [key]: e.target.value,
                                  })
                                }
                              />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <details className="source-preview">
                  <summary>Vista previa de los datos originales</summary>
                  <pre>
                    {JSON.stringify(
                      batch.rows.slice(0, 3).map((r: any) => r.raw),
                      null,
                      2,
                    )}
                  </pre>
                </details>
                <div className="form-actions">
                  <button className="primary" disabled={!online || busy}>
                    Confirmar mapeo y analizar
                  </button>
                </div>
              </form>
            </section>
          )}
          {batch?.state === "quality" && (
            <section className="panel quality-panel">
              <div className="panel-heading">
                <div>
                  <h2>3 · Informe de calidad</h2>
                  <p>
                    {batch.source} · {batch.rows.length} filas antes de
                    consolidar
                  </p>
                </div>
                <span className="tag">Decisiones humanas explícitas</span>
              </div>
              <div className="quality-summary" data-testid="quality-summary">
                {Object.entries(counts).map(([rule, count]) => (
                  <span key={rule} data-rule={rule}>
                    <strong>{count}</strong>
                    {rule}
                  </span>
                ))}
                {!Object.keys(counts).length && (
                  <p>
                    Sin anomalías detectadas. Confirma la identidad de cada
                    fila.
                  </p>
                )}
              </div>
              <div className="quality-help">
                <p>
                  <strong>Persona ≠ actividad.</strong> Vincular una persona
                  conserva su UUID; no fusiona expedientes. Actividades
                  idénticas se cuentan una sola vez entre fuentes. Revisa
                  nombre, nacimiento y municipio antes de vincular.
                </p>
                <p>
                  Corregir abre un ajuste manual con motivo. Aceptar conserva el
                  valor y la alerta en staging; fechas inválidas aceptadas no
                  entran en filtros de periodo y se muestran como “Sin fecha
                  válida”.
                </p>
                <div className="button-row">
                  <button
                    disabled={!online || busy}
                    onClick={() => {
                      const c = { ...choices },
                        p = { ...persons };
                      batch.rows
                        .filter((r: any) =>
                          r.anomalies.some((a: any) => a.severity === "error"),
                        )
                        .forEach((r: any) => {
                          c[r.id] = Object.fromEntries(
                            r.anomalies.map((a: any) => [a.rule, "excluir"]),
                          );
                          p[r.id] = "exclude";
                        });
                      setChoices(c);
                      setPersons(p);
                      setDirty(true);
                    }}
                  >
                    Excluir filas con errores
                  </button>
                  <button
                    disabled={!online || busy}
                    onClick={() => {
                      const c = { ...choices };
                      batch.rows.forEach((r: any) => {
                        c[r.id] = { ...c[r.id] };
                        r.anomalies
                          .filter((a: any) => a.severity === "aviso")
                          .forEach((a: any) => {
                            if (!c[r.id][a.rule]) c[r.id][a.rule] = "aceptar";
                          });
                      });
                      setChoices(c);
                      setDirty(true);
                    }}
                  >
                    Aceptar avisos pendientes
                  </button>
                </div>
              </div>
              <div className="quality-rows">
                {batch.rows.map((r: any) => (
                  <article
                    key={r.id}
                    className={
                      "quality-row " +
                      (persons[r.id] === "exclude" ? "excluded" : "")
                    }
                    data-testid="quality-row"
                  >
                    <div className="quality-row-heading">
                      <h3>
                        Fila {r.row_number} · {r.data.nombre || "Sin nombre"}
                      </h3>
                      <button
                        disabled={!online || busy}
                        onClick={() => {
                          setEdit({
                            id: r.id,
                            data: { ...r.data },
                            before: { ...r.data },
                          });
                          setReason("");
                        }}
                      >
                        Corregir fila {r.row_number}
                      </button>
                    </div>
                    <div className="quality-values">
                      <span>
                        Nacimiento:{" "}
                        <strong>{r.data.fecha_nacimiento || "Sin dato"}</strong>
                      </span>
                      <span>
                        Municipio:{" "}
                        <strong>{r.data.municipio || "Sin dato"}</strong>
                      </span>
                      <span>
                        {r.data.tipo_servicio} · {r.data.fecha || "Sin fecha"}
                      </span>
                      <span>
                        {r.data.categoria} · {r.data.cantidad} {r.data.unidad}
                      </span>
                    </div>
                    <div className="identity-choice">
                      <label>
                        Identidad · decisión explícita
                        <select
                          className="identity-select"
                          aria-label={`Identidad fila ${r.row_number}`}
                          value={persons[r.id] || ""}
                          disabled={!online || busy}
                          onChange={(e) => {
                            setPersons({ ...persons, [r.id]: e.target.value });
                            if (e.target.value === "exclude")
                              setChoices({
                                ...choices,
                                [r.id]: Object.fromEntries(
                                  r.anomalies.map((a: any) => [
                                    a.rule,
                                    "excluir",
                                  ]),
                                ),
                              });
                            setDirty(true);
                          }}
                        >
                          <option value="">Comparar y seleccionar</option>
                          {r.matches.map((m: any) => (
                            <option key={m.id} value={m.id}>
                              {m.nombre} ·{" "}
                              {m.fecha_nacimiento || "Sin nacimiento"} ·{" "}
                              {m.municipio} · {m.fuente} · {m.id} ·{" "}
                              {Math.round(m.score * 100)}%
                            </option>
                          ))}
                          <option value="new">
                            Es otra persona · nuevo ID de staging
                          </option>
                          <option value="exclude">Excluir esta fila</option>
                        </select>
                      </label>
                      {r.matches.slice(0, 2).map((m: any) => (
                        <p key={m.id}>
                          {m.nombre}: {m.reasons.join(", ")}.
                        </p>
                      ))}
                    </div>
                    <div className="anomaly-rules">
                      {r.anomalies.map((a: any) => (
                        <label key={a.rule}>
                          <span>
                            <strong>{a.rule}</strong> · {a.message}
                          </span>
                          <select
                            aria-label={`Regla ${a.rule} fila ${r.row_number}`}
                            disabled={!online || busy}
                            value={choices[r.id]?.[a.rule] || ""}
                            onChange={(e) => {
                              const value = e.target.value;
                              if (value === "corregir") {
                                setEdit({
                                  id: r.id,
                                  data: { ...r.data },
                                  before: { ...r.data },
                                });
                                setReason("");
                              }
                              setChoices({
                                ...choices,
                                [r.id]: { ...choices[r.id], [a.rule]: value },
                              });
                              setDirty(true);
                            }}
                          >
                            <option value="">Resolver anomalía</option>
                            <option value="aceptar">Aceptar</option>
                            <option value="excluir">Excluir fila</option>
                            <option value="corregir">
                              Corregir con motivo
                            </option>
                          </select>
                        </label>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
              <div className="form-actions quality-footer">
                <button
                  disabled={!online || busy}
                  onClick={() =>
                    void act({
                      action: "decide",
                      id: batch.id,
                      decisions: batch.rows.map((r: any) => ({
                        id: r.id,
                        person: persons[r.id],
                        rules: choices[r.id] || {},
                      })),
                    })
                  }
                >
                  Guardar decisiones de calidad
                </button>
                <button
                  className="primary"
                  disabled={!online || busy || dirty || !ready}
                  onClick={() =>
                    void act({ action: "consolidate", id: batch.id })
                  }
                >
                  Consolidar lote
                </button>
              </div>
            </section>
          )}
          {batch?.state === "consolidated" && (
            <section className="panel consolidated-panel">
              <ShieldCheck size={28} />
              <div>
                <h2>Lote consolidado · {batch.source}</h2>
                <p>
                  {batch.rows.filter((r: any) => r.included).length} filas
                  incluidas ·{" "}
                  {batch.rows.filter((r: any) => !r.included).length} excluidas.
                  Sus decisiones y ajustes permanecen auditados.
                </p>
              </div>
              <button onClick={() => setView("metrics")}>
                Ver indicadores
              </button>
            </section>
          )}
        </>
      )}
      {view === "dictionary" && (
        <section className="panel dictionary-panel">
          <div className="panel-heading">
            <h2>Diccionario del modelo común</h2>
            <span className="tag">12 campos documentados</span>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {[
                    "Campo",
                    "Definición",
                    "Tipo / unidad",
                    "Valores válidos",
                    "Periodo / programa / fuente",
                  ].map((s) => (
                    <th key={s}>{s}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dictionary.map((d) => (
                  <tr key={d.key}>
                    <td>
                      <strong>{d.key}</strong>
                    </td>
                    <td>{d.definition}</td>
                    <td>
                      {d.type} / {d.unit}
                    </td>
                    <td>{d.valid}</td>
                    <td>
                      {d.periodo}
                      <br />
                      {d.programa}
                      <br />
                      {d.fuente}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {view === "metrics" && report && (
        <>
          <section className="panel impact-filters">
            <div className="panel-heading">
              <div>
                <h2>Indicadores de impacto</h2>
                <p>
                  Fecha de corte: {report.cutoff} · {report.universe}
                </p>
              </div>
              <div className="button-row">
                <a
                  className="text-link"
                  href={"/api/impacto?" + params + "&format=csv"}
                >
                  Exportar CSV
                </a>
                <a
                  className="primary"
                  href={"/api/impacto?" + params + "&format=pdf"}
                >
                  <Download size={15} />
                  Informe de impacto PDF
                </a>
              </div>
            </div>
            <div className="form-grid">
              {["programa", "municipio", "tipo_servicio", "fuente"].map((k) => (
                <label key={k}>
                  {labels[k]}
                  <select
                    aria-label={`Filtro impacto ${k}`}
                    value={filters[k] || ""}
                    onChange={(e) =>
                      setFilters({ ...filters, [k]: e.target.value })
                    }
                  >
                    <option value="">Todos</option>
                    {report.options[k].map((v: string) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
              ))}
              {["desde", "hasta"].map((k) => (
                <label key={k}>
                  {k === "desde" ? "Desde" : "Hasta"}
                  <input
                    aria-label={`Filtro impacto ${k}`}
                    type="date"
                    value={filters[k] || ""}
                    onChange={(e) =>
                      setFilters({ ...filters, [k]: e.target.value })
                    }
                  />
                </label>
              ))}
              <button onClick={() => setFilters({})}>Limpiar filtros</button>
            </div>
          </section>
          <div className="impact-cards">
            {[
              {
                id: "personas",
                label: "Personas únicas",
                value: report.personas,
                formula:
                  "COUNT DISTINCT persona canónica: UUID existente o ID de staging confirmado",
              },
              {
                id: "total",
                label: "Actividades totales",
                value: report.total,
                formula:
                  "Registros de actividad; duplicados idénticos entre fuentes se cuentan una vez",
              },
              ...categories.map((c, i) => ({
                id: [
                  "servicios",
                  "atenciones",
                  "estudios",
                  "entregas",
                  "participaciones",
                ][i],
                label:
                  c === "Atención"
                    ? "Atenciones (categoría)"
                    : c === "Entrega de Insumos"
                      ? "Entregas de insumos"
                      : c === "Participación"
                        ? "Participaciones"
                        : c === "Servicio"
                          ? "Servicios"
                          : "Estudios",
                value: report.counts[c],
                sources: report.categorySources[c],
                formula: `COUNT registros con categoría = ${c}`,
              })),
            ].map((card) => (
              <article
                key={card.id}
                className="panel impact-card"
                data-testid={"indicator-" + card.id}
              >
                <div>
                  <h3>{card.label}</h3>
                  <abbr title={card.formula}>Fórmula ⓘ</abbr>
                </div>
                <strong>{card.value}</strong>
                <small>
                  Corte: {report.cutoff.slice(0, 10)} · Denominador:{" "}
                  {report.denominator} personas
                </small>
                <small>
                  Fuentes:{" "}
                  {(
                    ("sources" in card
                      ? card.sources
                      : report.sources) as string[]
                  ).join(", ") || "Sin actividad"}
                </small>
              </article>
            ))}
          </div>
          <section className="impact-ratio panel">
            <Users size={25} />
            <div>
              <h2>Atenciones por persona</h2>
              <strong data-testid="impact-ratio">
                {report.ratio.toFixed(2)}
              </strong>
              <p>
                Atenciones (categoría) / personas únicas. Las actividades no se
                convierten en pacientes adicionales.
              </p>
            </div>
          </section>
          <p className="care-note">
            {report.quantityNote} Se omitieron {report.duplicatesOmitted}{" "}
            actividades idénticas entre fuentes; no se eliminan registros
            originales.
          </p>
          <div className="impact-charts">
            {[
              ["byMonth", "Actividades por mes"],
              ["byMunicipio", "Actividades por municipio"],
              ["byCategory", "Actividades por categoría"],
            ].map(([key, title]) => (
              <section className="panel impact-chart" key={key}>
                <h2>{title}</h2>
                <div className="chart-surface">
                  <ResponsiveContainer width="100%" height={230} minWidth={0}>
                    <BarChart
                      data={report[key]}
                      margin={{ top: 15, right: 15, bottom: 35, left: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="name"
                        angle={-15}
                        textAnchor="end"
                        interval={0}
                        tick={{ fontSize: 9 }}
                      />
                      <YAxis allowDecimals={false} width={35} />
                      <Tooltip />
                      <Bar
                        isAnimationActive={false}
                        dataKey="value"
                        name="Actividades"
                        fill="#E4007C"
                        maxBarSize={45}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <details>
                  <summary>Ver datos del gráfico</summary>
                  {report[key].map((d: any) => (
                    <p key={d.name}>
                      {d.name}: {d.value}
                    </p>
                  ))}
                </details>
              </section>
            ))}
          </div>
          <section className="panel adjustment-annex">
            <div className="panel-heading">
              <h2>Anexo · ajustes manuales</h2>
              <span className="tag">
                {report.adjustments.length} ajustes en selección
              </span>
            </div>
            {report.adjustments.map((a: any) => (
              <article key={a.id}>
                <strong>
                  {a.usuario} · {a.timestamp}
                </strong>
                <p>
                  {a.detalle.fuente} · fila {a.detalle.fila} ·{" "}
                  {a.detalle.motivo}
                </p>
                <details>
                  <summary>Antes / después</summary>
                  <pre>
                    {JSON.stringify(
                      { antes: a.detalle.antes, despues: a.detalle.despues },
                      null,
                      2,
                    )}
                  </pre>
                </details>
              </article>
            ))}
            {!report.adjustments.length && (
              <p className="empty">Sin ajustes manuales en esta selección.</p>
            )}
          </section>
        </>
      )}
      {edit && (
        <div className="modal-backdrop">
          <form
            className="modal impact-adjust"
            role="dialog"
            aria-modal="true"
            aria-label="Ajuste manual"
            onSubmit={(e) => {
              e.preventDefault();
              const patch = Object.fromEntries(
                Object.entries(edit.data).filter(
                  ([k, v]) => v !== edit.before[k],
                ),
              );
              void act({ action: "adjust", rowId: edit.id, patch, reason });
            }}
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">TRAZABILIDAD DE DATOS</span>
                <h2>Ajuste manual</h2>
              </div>
              <button type="button" onClick={() => setEdit(null)}>
                Cancelar
              </button>
            </div>
            <div className="modal-body">
              <p>
                Corregir no altera el archivo original. Se registran
                responsable, fecha, motivo y valores antes/después. Se
                recalculan las alertas.
              </p>
              <div className="form-grid">
                {fields.map((k) => (
                  <label key={k}>
                    {labels[k]}
                    <input
                      aria-label={`Ajustar ${k}`}
                      value={edit.data[k] || ""}
                      onChange={(e) =>
                        setEdit({
                          ...edit,
                          data: { ...edit.data, [k]: e.target.value },
                        })
                      }
                    />
                  </label>
                ))}
              </div>
              <label>
                Motivo obligatorio
                <textarea
                  aria-label="Motivo ajuste"
                  required
                  maxLength={1000}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <div className="form-actions">
                <button className="primary" disabled={!online || busy}>
                  Guardar ajuste manual
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
