"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowDown,
  Play,
  Fingerprint,
  Building2,
  ChartNoAxesCombined,
  FileLock2,
  WifiOff,
  RefreshCw,
  ShieldCheck,
  UserCheck,
  Check,
  Sparkles,
  CalendarDays,
  Stethoscope,
  ScrollText,
} from "lucide-react";
import { BrandMark } from "./brand-mark";
import { NexoScene } from "./nexo-scene";
import { ChangeRequestLink } from "./change-request-link";
import { jaroWinkler, normalized } from "@/lib/matching";

const modules = [
  {
    icon: Fingerprint,
    tag: "Identidad",
    title: "Un expediente por persona",
    body: "Cada mujer conserva un identificador estable. Sus visitas, estudios y servicios se suman a la misma historia, en cualquier municipio y con cualquier brigada.",
    points: ["Búsqueda por varios datos", "Posibles duplicados lado a lado", "La decisión siempre es humana"],
    wide: true,
  },
  {
    icon: Building2,
    tag: "Territorio",
    title: "Jornadas coordinadas con municipios",
    body: "Requisitos, correcciones y cartas compromiso en un solo tablero, con un semáforo que dice qué falta y a quién le toca.",
    points: ["Checklist por jornada", "Cartas con cláusulas fijas", "Semáforo operativo"],
  },
  {
    icon: ChartNoAxesCombined,
    tag: "Evidencia",
    title: "Impacto que se puede auditar",
    body: "Las fuentes se integran con reglas de calidad y las personas se cuentan una sola vez, separadas de atenciones, estudios e insumos.",
    points: ["Importa CSV y Excel", "Sin doble conteo", "Informes con anexos"],
  },
  {
    icon: FileLock2,
    tag: "Confianza",
    title: "Resultados entregados con seguridad",
    body: "El resultado se revisa, lo autoriza un médico y llega con un aviso neutro, un enlace temporal y verificación de identidad.",
    points: ["Autorización clínica", "Enlace que expira", "Entrega asistida"],
  },
];

const flow = [
  [CalendarDays, "Se acuerda la jornada", "EIRA y el municipio completan requisitos y firman la carta compromiso."],
  [WifiOff, "Se captura en campo", "La brigada registra pacientes y estudios aunque no haya señal."],
  [RefreshCw, "Se sincroniza", "Al volver la conexión, los datos suben y los conflictos se resuelven campo por campo."],
  [Stethoscope, "Se autoriza el resultado", "Laboratorio carga el documento y solo el médico lo libera."],
  [FileLock2, "Se entrega con cuidado", "La paciente recibe un aviso neutro y consulta su documento verificando su identidad."],
  [ScrollText, "Se rinde cuentas", "Cada acción queda en bitácora y alimenta indicadores sin duplicar personas."],
] as const;

const records = [
  { nombre: "María Guadalupe Hernández López", nac: "14/03/1978", mun: "Zapotlán el Grande", visitas: 3 },
  { nombre: "María Fernanda Hernández Ruiz", nac: "02/11/1990", mun: "Tuxpan", visitas: 1 },
  { nombre: "Guadalupe Hernández Lara", nac: "27/07/1969", mun: "Gómez Farías", visitas: 2 },
];

function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>("[data-reveal]");
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add("in")),
      { threshold: 0.14 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

function tilt(e: React.PointerEvent<HTMLElement>) {
  if (e.pointerType === "touch") return;
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
  el.style.setProperty("--ry", `${(x - 0.5) * 9}deg`);
  el.style.setProperty("--rx", `${(0.5 - y) * 9}deg`);
  el.style.setProperty("--mx", `${x * 100}%`);
  el.style.setProperty("--my", `${y * 100}%`);
}
function untilt(e: React.PointerEvent<HTMLElement>) {
  e.currentTarget.style.setProperty("--ry", "0deg");
  e.currentTarget.style.setProperty("--rx", "0deg");
}

function IdentityLab() {
  const [name, setName] = useState("Ma. Guadalupe Hernandes Lopes");
  const [linked, setLinked] = useState<number | null>(null);
  const scored = useMemo(
    () =>
      records
        .map((r, i) => ({ ...r, i, score: Math.round(jaroWinkler(normalized(name), normalized(r.nombre)) * 100) }))
        .sort((a, b) => b.score - a.score),
    [name],
  );
  const best = scored[0];
  const probable = name.trim().length > 3 && best.score >= 80;
  return (
    <div className="lab glass" data-reveal>
      <div className="lab-input">
        <label htmlFor="lab-name">Escribe un nombre como llegaría de campo</label>
        <input
          id="lab-name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setLinked(null);
          }}
          placeholder="Nombre y apellidos"
          autoComplete="off"
        />
        <p>Con faltas, abreviaturas o sin acentos: el sistema compara y propone; nunca fusiona solo.</p>
      </div>
      <ul className="lab-list">
        {scored.map((r) => (
          <li key={r.i} className={r.i === best.i && probable ? "hit" : ""}>
            <div>
              <strong>{r.nombre}</strong>
              <small>
                {r.nac} · {r.mun} · {r.visitas} {r.visitas === 1 ? "visita" : "visitas"}
              </small>
            </div>
            <span className="lab-score">{r.score}%</span>
            <i style={{ width: `${r.score}%` }} />
          </li>
        ))}
      </ul>
      <div className="lab-decision">
        {linked !== null ? (
          <p className="lab-ok">
            <Check size={18} /> Visita agregada al expediente de <strong>{records[linked].nombre}</strong>. La decisión
            quedó registrada en la bitácora.
          </p>
        ) : probable ? (
          <>
            <p>
              <Sparkles size={16} /> Posible coincidencia. ¿Es la misma persona?
            </p>
            <div>
              <button className="primary" onClick={() => setLinked(best.i)}>
                <UserCheck size={16} /> Sí, es ella
              </button>
              <button onClick={() => setName("")}>No, es alguien nueva</button>
            </div>
          </>
        ) : (
          <p>
            <Sparkles size={16} /> Sin coincidencias suficientes: se crearía un expediente nuevo.
          </p>
        )}
      </div>
    </div>
  );
}

export function Landing() {
  const progress = useRef(0);
  const [scrolled, setScrolled] = useState(false);
  const [step, setStep] = useState(0);
  useReveal();
  useEffect(() => {
    const on = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      progress.current = max > 0 ? window.scrollY / max : 0;
      document.documentElement.style.setProperty("--scroll", String(progress.current));
      setScrolled(window.scrollY > 20);
    };
    on();
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    return () => {
      window.removeEventListener("scroll", on);
      window.removeEventListener("resize", on);
    };
  }, []);
  useEffect(() => {
    const t = setInterval(() => setStep((s) => (s + 1) % flow.length), 3200);
    return () => clearInterval(t);
  }, [step]);
  return (
    <main className="lp">
      <div className="lp-scene">
        <NexoScene progressRef={progress} />
      </div>
      <i className="lp-progress" />
      <header className={"lp-nav" + (scrolled ? " solid" : "")}>
        <Link href="/" className="brand">
          <BrandMark size={38} />
          <div>
            NEXO ROSA<small>EIRA SYSTEM</small>
          </div>
        </Link>
        <nav>
          <a href="#expediente">Expediente único</a>
          <a href="#sistema">El sistema</a>
          <a href="#recorrido">Recorrido</a>
          <Link href="/guia">Guía</Link>
          <Link href="/presentacion">Presentación</Link>
        </nav>
        <Link href="/login" className="primary">
          Ingresar <ArrowRight size={16} />
        </Link>
      </header>

      <section className="lp-hero">
        <div className="lp-hero-copy">
          <span className="chip">
            <i /> EIRA · Movimiento Rosa A.C.
          </span>
          <h1>
            Conectamos salud,
            <br />
            <em>fortalecemos comunidades.</em>
          </h1>
          <p>
            Nexo Rosa reúne en un solo sistema el expediente de cada mujer, el trabajo con los municipios, la evidencia
            de impacto y la entrega segura de resultados. Funciona en campo, con o sin internet.
          </p>
          <div className="lp-cta">
            <Link className="primary big" href="/login">
              Explorar la plataforma <ArrowRight size={18} />
            </Link>
            <a className="ghost" href="#expediente">
              Ver cómo funciona <ArrowDown size={16} />
            </a>
            <Link className="ghost" href="/presentacion">
              <Play size={16} /> Ver presentación
            </Link>
          </div>
          <small className="lp-demo">Demostración con datos sintéticos. No usar información real.</small>
        </div>
        <span className="lp-hint">Arrastra para girar · desliza para transformar</span>
      </section>

      <section className="lp-strip" data-reveal>
        {[
          ["1", "expediente por persona"],
          ["0", "fusiones automáticas"],
          ["5", "roles con permisos en servidor"],
          ["100%", "de la captura disponible sin señal"],
        ].map(([n, l]) => (
          <div key={l}>
            <strong>{n}</strong>
            <span>{l}</span>
          </div>
        ))}
      </section>

      <section className="lp-section" id="expediente">
        <div className="lp-head" data-reveal>
          <span className="eyebrow">EXPEDIENTE DIGITAL ÚNICO</span>
          <h2>
            Una mujer, una historia.
            <br />
            <em>Aunque su nombre llegue distinto.</em>
          </h2>
          <p>
            El corazón del sistema: cada persona tiene un solo expediente que la acompaña de jornada en jornada. Pruébalo
            aquí con el mismo motor de coincidencias que usa la app.
          </p>
        </div>
        <IdentityLab />
        <div className="lp-trio">
          {[
            [WifiOff, "Captura sin conexión", "Los registros se guardan en el dispositivo y esperan en una cola hasta sincronizar."],
            [UserCheck, "Confirmación humana", "El sistema sugiere; una persona decide si dos registros son la misma mujer."],
            [ShieldCheck, "Bitácora inmutable", "Quién vio, cambió o autorizó cada dato queda escrito y no se puede borrar."],
          ].map(([Icon, t, b]: any, i) => (
            <article className="glass" key={t} data-reveal style={{ transitionDelay: `${i * 90}ms` }}>
              <Icon size={22} />
              <h3>{t}</h3>
              <p>{b}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="lp-section" id="sistema">
        <div className="lp-head" data-reveal>
          <span className="eyebrow">UN SOLO SISTEMA</span>
          <h2>
            Todo conectado
            <br />
            <em>alrededor de la persona.</em>
          </h2>
          <p>Lo que antes vivía en hojas de cálculo, mensajes y papel ahora comparte la misma información.</p>
        </div>
        <div className="lp-bento">
          {modules.map((m, i) => (
            <article
              key={m.title}
              className={"tilt glass" + (m.wide ? " wide" : "")}
              onPointerMove={tilt}
              onPointerLeave={untilt}
              data-reveal
              style={{ transitionDelay: `${i * 80}ms` }}
            >
              <span className="tilt-glare" />
              <div className="tilt-main">
                <div className="tilt-icon">
                  <m.icon size={26} />
                </div>
                <small>{m.tag}</small>
                <h3>{m.title}</h3>
                <p>{m.body}</p>
              </div>
              <ul>
                {m.points.map((p) => (
                  <li key={p}>
                    <Check size={14} /> {p}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="lp-section" id="recorrido">
        <div className="lp-head" data-reveal>
          <span className="eyebrow">DE LA JORNADA AL RESULTADO</span>
          <h2>
            Un recorrido,
            <br />
            <em>sin perder a nadie en el camino.</em>
          </h2>
        </div>
        <div className="lp-flow glass" data-reveal>
          <ol>
            {flow.map(([Icon, t], i) => (
              <li key={t} className={i === step ? "on" : i < step ? "past" : ""}>
                <button onClick={() => setStep(i)} aria-label={t} aria-current={i === step}>
                  <Icon size={20} />
                </button>
                <span>{t}</span>
              </li>
            ))}
            <i className="lp-flow-bar" style={{ "--p": step / (flow.length - 1) } as React.CSSProperties} />
          </ol>
          <div className="lp-flow-detail" key={step}>
            <span>
              {String(step + 1).padStart(2, "0")} / {String(flow.length).padStart(2, "0")}
            </span>
            <h3>{flow[step][1]}</h3>
            <p>{flow[step][2]}</p>
          </div>
        </div>
      </section>

      <section className="lp-final" data-reveal>
        <BrandMark size={84} />
        <h2>
          Innovación que cuida,
          <br />
          <em>tecnología que une.</em>
        </h2>
        <p>Entra con un perfil de demostración y recorre el sistema completo.</p>
        <div className="lp-cta center">
          <Link className="primary big" href="/login">
            Ingresar a Nexo Rosa <ArrowRight size={18} />
          </Link>
          <Link className="ghost" href="/guia">
            Guía de demostración
          </Link>
        </div>
      </section>

      <footer className="lp-footer">
        <span>EIRA · Federico del Toro 83 int 205, Centro, Ciudad Guzmán, Jalisco, C.P. 49000</span>
        <span>Tel. 3414108111 y 3411596782 · hola@eiraac.org</span>
        <ChangeRequestLink />
      </footer>
    </main>
  );
}
