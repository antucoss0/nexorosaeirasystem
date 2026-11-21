import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
const demos = [
  {
    title: "Reto 1 · Identidad y continuidad clínica",
    href: "/campo",
    role: "Brigadista → Administración",
    steps: [
      "Selecciona una jornada activa y activa Offline simulado.",
      "Captura Maria Guadalupe Lopez y compara las coincidencias con nombre y nacimiento.",
      "Confirma misma paciente para agregar una visita sin crear otro UUID.",
      "Vuelve online, sincroniza hasta cero pendientes y abre el historial. Completa e imprime Mamaria o Cervical.",
      "Administración revisa conflictos, vincula o descarta duplicados y consulta la bitácora.",
    ],
  },
  {
    title: "Reto 2 · Jornadas y cartas",
    href: "/admin/jornadas",
    role: "Administración → Enlace municipal",
    steps: [
      "Crea una jornada: municipio, fecha, servicios, responsables, enlace y requisitos configurables.",
      "Genera carta v1. Las cláusulas son fijas; cambia solo variables y descarga el PDF.",
      "Entra como municipio (Zapotlán el Grande) y carga un PDF o imagen en un requisito.",
      "Administración solicita corrección con nota; municipio vuelve a subir y admin aprueba.",
      "Revisa el historial, el semáforo y un recordatorio amable, limitado a uno cada 24 horas.",
    ],
  },
  {
    title: "Reto 3 · Calidad e impacto",
    href: "/admin/impacto",
    role: "Administración",
    steps: [
      "Carga fuente sintética 1 y confirma el mapeo sugerido; revisa programa, categoría, cantidad y unidad.",
      "Inspecciona reglas por fila, duplicados y discrepancias. Corrige una fecha con motivo para registrar un ajuste manual.",
      "Excluye errores restantes y resuelve avisos. Compara y confirma la identidad de cada fila: UUID existente, fila previa o persona distinta.",
      "Guarda decisiones y consolida. Repite con fuente sintética 2, vinculando las personas compartidas.",
      "Revisa personas únicas separadas de actividades por categoría, aplica filtros y consulta fórmulas, denominadores y fuentes. Exporta CSV/PDF con anexo de ajustes.",
    ],
  },
  {
    title: "Reto 4 · Entrega segura de documentos",
    href: "/admin/pap",
    role: "Laboratorio → Administración → Médico → Portal",
    steps: [
      "Laboratorio genera PDF sintético; busca paciente y confirma nombre y nacimiento lado a lado. Asocia el documento.",
      "Administración confirma identidad y legibilidad o devuelve con nota. Médico revisa y autoriza clínicamente.",
      "Administración emite mensaje neutral. Copia el enlace de una sola vista previa; la bandeja no conserva tokens en claro.",
      "Abre el portal sin login y verifica nacimiento o últimos cuatro dígitos de teléfono. Descarga y comprueba Consultado.",
      "Registra entrega asistida con promotora, método, fecha y firma. Prueba revocar o regenerar el enlace.",
    ],
  },
];
export default function Guia() {
  return (
    <main className="demo-guide">
      <header>
        <Link href="/" className="brand dark">
          <BrandMark />
          <div>
            NEXO ROSA<small>EIRA SYSTEM</small>
          </div>
        </Link>
        <Link className="primary" href="/login">
          Ingresar a la demo →
        </Link>
      </header>
      <span className="eyebrow">RECORRIDO GUIADO</span>
      <h1>Cuatro retos, un mismo cuidado.</h1>
      <p className="guide-intro">
        Guía de demostración con información ficticia. Cambia de rol cerrando
        sesión o utiliza perfiles de navegador separados. Los circuitos
        administrativos y archivos requieren conexión; Campo permite captura
        offline.
      </p>
      <section className="panel demo-credentials">
        <div className="panel-heading">
          <h2>Accesos de demostración</h2>
          <span className="tag">Contraseña: eira2026</span>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Rol</th>
                <th>Email</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Brigadista", "brigadista"],
                ["Médico", "medico"],
                ["Laboratorio", "laboratorio"],
                ["Enlace municipal · Zapotlán el Grande", "municipio"],
                ["Administración", "admin"],
              ].map(([name, id]) => (
                <tr key={id}>
                  <td>{name}</td>
                  <td>{id}@eira.mx</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {demos.map((d, i) => (
        <section className="panel guide-reto" key={d.href}>
          <span className="eyebrow">
            RECORRIDO {i + 1} · {d.role}
          </span>
          <h2>{d.title}</h2>
          <ol>
            {d.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <Link className="text-link" href={d.href}>
            Abrir módulo →
          </Link>
        </section>
      ))}
      <p className="notice">
        Accesos públicos solo para esta demo local. No exponer a internet ni
        cargar datos reales. Herramientas de verificación:
        scripts/phase2-check.mjs, scripts/phase3-check.mjs y
        scripts/phase4-check.mjs.
      </p>
    </main>
  );
}
