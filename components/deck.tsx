"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight, ChevronLeft, ChevronRight, Database, FileLock2, Fingerprint, HeartHandshake, KeyRound, Layers, LineChart,
  MapPinned, Maximize, Pause, Play, RotateCcw, ScrollText, ServerCog, ShieldCheck, Smartphone, Trash2, UserCheck, WifiOff, X,
} from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { DeckScene, type SceneState, type Shape } from "@/components/deck-scene";

/** Headline whose letters each animate in on their own and react to the pointer. */
function Kinetic({ text, accent }: { text: string; accent?: string }) {
  let n = 0;
  const line = (value: string, cls: string) =>
    value.split(" ").map((word, wi) => (
      <span className={"pz-word " + cls} key={cls + wi}>
        {[...word].map((ch, ci) => {
          const i = n++;
          return (
            <span className="pz-ch" key={ci}>
              <span className="pz-in" style={{ "--i": i, "--r": `${((i * 37) % 21) - 10}deg`, "--y": `${30 + ((i * 53) % 50)}px` } as React.CSSProperties}>
                {ch}
              </span>
            </span>
          );
        })}
      </span>
    ));
  return (
    <h2 className="pz-title" aria-label={accent ? `${text} ${accent}` : text}>
      {line(text, "")}
      {accent && <br />}
      {accent && line(accent, "hot")}
    </h2>
  );
}

function Count({ to, on, suffix = "" }: { to: number; on: boolean; suffix?: string }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!on) { setV(0); return; }
    let raf = 0;
    const t0 = performance.now() + 500;
    const tick = (now: number) => {
      const f = Math.min(1, Math.max(0, (now - t0) / 1400));
      setV(Math.round(to * (1 - (1 - f) ** 3)));
      if (f < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [on, to]);
  return <b>{v}{suffix}</b>;
}

type Slide = { key: string; tag: string; secs: number; shape: Shape; side: number; center?: boolean; body: (on: boolean) => React.ReactNode };

const slides: Slide[] = [
  {
    key: "inicio", tag: "Nexo Rosa EIRA System", secs: 10, shape: "heart", side: 0.5, center: true,
    body: () => (
      <>
        <Kinetic text="Una mujer." accent="Un solo expediente." />
        <p className="pz-lead pz-r" style={{ "--d": 9 } as React.CSSProperties}>
          Toda su historia de salud, viva y conectada, desde la jornada en su comunidad hasta la entrega de su resultado.
        </p>
      </>
    ),
  },
  {
    key: "problema", tag: "El punto de partida", secs: 12, shape: "chaos", side: 0.73,
    body: () => (
      <>
        <Kinetic text="Hoy su historia" accent="está en pedazos." />
        <div className="pz-chips">
          {["Hojas de cálculo", "Mensajes sueltos", "Formularios", "Papel"].map((c, i) => (
            <span className="pz-chip pz-r" style={{ "--d": 6 + i * 2 } as React.CSSProperties} key={c}>{c}</span>
          ))}
        </div>
        <p className="pz-lead pz-r" style={{ "--d": 16 } as React.CSSProperties}>
          La misma paciente se registra varias veces. Nadie ve su seguimiento completo y el impacto no se puede demostrar.
        </p>
      </>
    ),
  },
  {
    key: "funciona", tag: "Funcionamiento real del prototipo", secs: 18, shape: "helix", side: 0.73,
    body: () => (
      <>
        <Kinetic text="Así funciona," accent="en vivo." />
        <ol className="pz-flow">
          {[
            [WifiOff, "Captura sin señal", "La brigadista registra en su celular. Todo se guarda en el dispositivo."],
            [Fingerprint, "Reconoce a la paciente", "«Maria Guadalupe Lopes» coincide 98 % con «María Guadalupe López»."],
            [UserCheck, "Una persona decide", "El sistema sugiere; la brigadista confirma. Nunca fusiona solo."],
            [Database, "Sincroniza al volver la red", "La visita se suma a su expediente con identificador estable EIRA-MX."],
          ].map(([Icon, t, d], i) => {
            const I = Icon as typeof WifiOff;
            return (
              <li className="pz-step pz-r" style={{ "--d": 6 + i * 9 } as React.CSSProperties} key={t as string}>
                <i><I size={18} /></i>
                <div><strong>{t as string}</strong><span>{d as string}</span></div>
                {i === 1 && <em className="pz-meter"><u /></em>}
              </li>
            );
          })}
        </ol>
      </>
    ),
  },
  {
    key: "usabilidad", tag: "Usabilidad", secs: 13, shape: "phone", side: 0.73,
    body: () => (
      <>
        <Kinetic text="Hecha para" accent="el trabajo en campo." />
        <div className="pz-grid three">
          {[
            [Smartphone, "Celular primero", "Botones grandes y navegación inferior con el pulgar."],
            [WifiOff, "Con o sin internet", "La captura no se detiene cuando se cae la señal."],
            [Layers, "Formatos conocidos", "Revisión mamaria y citología cervical, tal como en papel."],
          ].map(([Icon, t, d], i) => {
            const I = Icon as typeof WifiOff;
            return (
              <article className="pz-card pz-r" style={{ "--d": 7 + i * 4 } as React.CSSProperties} key={t as string}>
                <I size={22} /><strong>{t as string}</strong><span>{d as string}</span>
              </article>
            );
          })}
        </div>
      </>
    ),
  },
  {
    key: "sistema", tag: "Un sistema, cuatro frentes", secs: 13, shape: "clusters", side: 0.73,
    body: () => (
      <>
        <Kinetic text="Todo conectado" accent="al mismo expediente." />
        <div className="pz-grid two">
          {[
            [Fingerprint, "Identidad", "Expediente único y continuidad clínica."],
            [MapPinned, "Territorio", "Jornadas, requisitos y cartas con cada municipio."],
            [LineChart, "Evidencia", "Indicadores trazables para donantes y aliados."],
            [HeartHandshake, "Confianza", "Resultados entregados de forma segura."],
          ].map(([Icon, t, d], i) => {
            const I = Icon as typeof WifiOff;
            return (
              <article className="pz-card row pz-r" style={{ "--d": 7 + i * 4 } as React.CSSProperties} key={t as string}>
                <I size={22} /><div><strong>{t as string}</strong><span>{d as string}</span></div>
              </article>
            );
          })}
        </div>
      </>
    ),
  },
  {
    key: "impacto", tag: "Impacto", secs: 13, shape: "bars", side: 0.73,
    body: (on) => (
      <>
        <Kinetic text="Impacto que" accent="se puede comprobar." />
        <div className="pz-stats">
          <div className="pz-stat pz-r" style={{ "--d": 7 } as React.CSSProperties}><Count to={1} on={on} /><span>expediente por mujer, sin duplicados</span></div>
          <div className="pz-stat pz-r" style={{ "--d": 10 } as React.CSSProperties}><Count to={4} on={on} /><span>fuentes dispersas reunidas en un sistema</span></div>
          <div className="pz-stat pz-r" style={{ "--d": 13 } as React.CSSProperties}><Count to={100} on={on} suffix=" %" /><span>de las cifras rastreables hasta su origen</span></div>
        </div>
        <p className="pz-lead pz-r" style={{ "--d": 17 } as React.CSSProperties}>
          Personas únicas y atenciones se cuentan por separado: el donante ve cuántas mujeres, no cuántos renglones.
        </p>
      </>
    ),
  },
  {
    key: "privacidad", tag: "Privacidad y confianza", secs: 14, shape: "shield", side: 0.73,
    body: () => (
      <>
        <Kinetic text="Sus datos," accent="bajo llave." />
        <ul className="pz-list">
          {[
            [ShieldCheck, "Permisos por rol validados en el servidor"],
            [FileLock2, "Documentos clínicos cifrados con AES-256-GCM"],
            [KeyRound, "Resultados con enlace temporal y PIN, tras autorización médica"],
            [ScrollText, "Bitácora inalterable de cada acción"],
            [Trash2, "El dispositivo se limpia al cerrar sesión"],
          ].map(([Icon, t], i) => {
            const I = Icon as typeof WifiOff;
            return <li className="pz-r" style={{ "--d": 6 + i * 3 } as React.CSSProperties} key={t as string}><I size={18} />{t as string}</li>;
          })}
        </ul>
      </>
    ),
  },
  {
    key: "escala", tag: "Innovación y escalabilidad", secs: 14, shape: "globe", side: 0.73,
    body: () => (
      <>
        <Kinetic text="Nace en una jornada." accent="Crece con el país." />
        <div className="pz-grid two">
          <article className="pz-card pz-r" style={{ "--d": 8 } as React.CSSProperties}>
            <Fingerprint size={22} /><strong>Innovación</strong>
            <span>Primero local: cada celular trabaja solo y luego se reconcilia. La tecnología propone, una persona decide.</span>
          </article>
          <article className="pz-card pz-r" style={{ "--d": 12 } as React.CSSProperties}>
            <ServerCog size={22} /><strong>Escalabilidad</strong>
            <span>Un contenedor, código abierto y costo mínimo. Sumar un municipio es sumar una jornada, no otro sistema.</span>
          </article>
        </div>
        <p className="pz-lead pz-r" style={{ "--d": 17 } as React.CSSProperties}>Siguiente paso: piloto con EIRA en una jornada real.</p>
      </>
    ),
  },
  {
    key: "cierre", tag: "EIRA · Movimiento Rosa A.C.", secs: 13, shape: "heart", side: 0.5, center: true,
    body: () => (
      <>
        <Kinetic text="Conectamos salud," accent="fortalecemos comunidades." />
        <p className="pz-lead pz-r" style={{ "--d": 12 } as React.CSSProperties}>Innovación que cuida, tecnología que une.</p>
        <div className="pz-cta pz-r" style={{ "--d": 16 } as React.CSSProperties}>
          <Link className="primary big" href="/login">Probar la plataforma <ArrowRight size={18} /></Link>
        </div>
      </>
    ),
  },
];
const TOTAL = slides.reduce((a, s) => a + s.secs, 0);
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function Deck() {
  const [idx, setIdx] = useState(0);
  const [prev, setPrev] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const scene = useRef<SceneState>({ shape: slides[0].shape, side: slides[0].side, burst: 0 });
  const root = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const fills = useRef<(HTMLElement | null)[]>([]);
  const time = useRef<HTMLSpanElement>(null);
  const live = useRef({ idx: 0, playing: false, elapsed: 0 });
  const fx = useRef<{ r: SVGFEOffsetElement | null; b: SVGFEOffsetElement | null }>({ r: null, b: null });

  const go = useCallback((to: number) => {
    const next = Math.max(0, Math.min(slides.length - 1, to));
    if (next === live.current.idx) return;
    setPrev(live.current.idx);
    live.current.idx = next; live.current.elapsed = 0;
    scene.current.shape = slides[next].shape; scene.current.side = slides[next].side; scene.current.burst = 1;
    setIdx(next);
  }, []);
  const toggle = useCallback(() => {
    setStarted(true);
    if (!live.current.playing && live.current.idx === slides.length - 1 && live.current.elapsed >= slides[live.current.idx].secs) go(0);
    live.current.playing = !live.current.playing;
    setPlaying(live.current.playing);
  }, [go]);

  // clock, per-slide progress and transition energy
  useEffect(() => {
    let raf = 0, last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      const l = live.current, s = scene.current;
      s.burst = s.burst < 0.01 ? 0 : s.burst * Math.exp(-dt * 3.4);
      const off = s.burst * 14;
      fx.current.r?.setAttribute("dx", String(off)); fx.current.b?.setAttribute("dx", String(-off));
      if (stage.current) stage.current.style.filter = s.burst > 0.04 ? "url(#pz-ca)" : "";
      if (l.playing) {
        l.elapsed += dt;
        if (l.elapsed >= slides[l.idx].secs) {
          if (l.idx < slides.length - 1) go(l.idx + 1);
          else { l.elapsed = slides[l.idx].secs; l.playing = false; setPlaying(false); }
        }
      }
      fills.current.forEach((el, i) => { if (el) el.style.transform = `scaleX(${i < l.idx ? 1 : i > l.idx ? 0 : Math.min(1, l.elapsed / slides[i].secs)})`; });
      if (time.current) time.current.textContent = `${clock(slides.slice(0, l.idx).reduce((a, x) => a + x.secs, 0) + l.elapsed)} / ${clock(TOTAL)}`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [go]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "PageDown") go(live.current.idx + 1);
      else if (e.key === "ArrowLeft" || e.key === "PageUp") go(live.current.idx - 1);
      else if (e.key === " " || e.key === "Enter") { if ((e.target as HTMLElement).closest("a,button")) return; e.preventDefault(); toggle(); }
      else if (e.key.toLowerCase() === "f") root.current?.requestFullscreen?.().catch(() => {});
    };
    let sx = 0;
    const ts = (e: TouchEvent) => { sx = e.touches[0].clientX; };
    const te = (e: TouchEvent) => { const d = e.changedTouches[0].clientX - sx; if (Math.abs(d) > 60) go(live.current.idx + (d < 0 ? 1 : -1)); };
    window.addEventListener("keydown", key);
    window.addEventListener("touchstart", ts, { passive: true });
    window.addEventListener("touchend", te, { passive: true });
    return () => { window.removeEventListener("keydown", key); window.removeEventListener("touchstart", ts); window.removeEventListener("touchend", te); };
  }, [go, toggle]);

  // letters lean away from the pointer and light up
  useEffect(() => {
    if (matchMedia("(pointer: coarse)").matches) return;
    let letters: { el: HTMLElement; x: number; y: number; hot: boolean }[] = [];
    let raf = 0, mx = -9999, my = -9999;
    const measure = () => {
      letters = [...(root.current?.querySelectorAll<HTMLElement>(".pz-slide.on .pz-ch") ?? [])].map((el) => {
        el.style.transform = "";
        const r = el.getBoundingClientRect();
        return { el, x: r.left + r.width / 2, y: r.top + r.height / 2, hot: false };
      });
    };
    const timer = setTimeout(measure, 900);
    const frame = () => {
      raf = 0;
      for (const l of letters) {
        const dx = l.x - mx, dy = l.y - my, d = Math.hypot(dx, dy), f = Math.max(0, 1 - d / 150);
        if (f > 0) {
          l.hot = true;
          l.el.style.transform = `translate(${(dx / (d || 1)) * f * 16}px, ${(dy / (d || 1)) * f * 16 - f * 6}px) scale(${1 + f * 0.32}) rotate(${(dx / 150) * f * 14}deg)`;
          l.el.style.setProperty("--f", f.toFixed(2));
        } else if (l.hot) { l.hot = false; l.el.style.transform = ""; l.el.style.setProperty("--f", "0"); }
      }
    };
    const move = (e: PointerEvent) => { mx = e.clientX; my = e.clientY; if (!raf) raf = requestAnimationFrame(frame); };
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("resize", measure);
    return () => { clearTimeout(timer); cancelAnimationFrame(raf); window.removeEventListener("pointermove", move); window.removeEventListener("resize", measure); };
  }, [idx]);

  const ended = !playing && idx === slides.length - 1 && started;
  return (
    <div className={"pz" + (playing ? " playing" : "")} ref={root}>
      <svg width="0" height="0" aria-hidden="true" style={{ position: "absolute" }}>
        <filter id="pz-ca" x="-5%" y="0" width="110%" height="100%" colorInterpolationFilters="sRGB">
          <feColorMatrix in="SourceGraphic" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r" />
          <feOffset in="r" dx="0" result="ro" ref={(el) => { fx.current.r = el; }} />
          <feColorMatrix in="SourceGraphic" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="g" />
          <feColorMatrix in="SourceGraphic" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="b" />
          <feOffset in="b" dx="0" result="bo" ref={(el) => { fx.current.b = el; }} />
          <feBlend in="ro" in2="g" mode="screen" result="rg" />
          <feBlend in="rg" in2="bo" mode="screen" />
        </filter>
      </svg>
      <div className="pz-bg" />
      <DeckScene state={scene} />
      <div className="pz-vignette" />
      <i className="pz-sweep" key={"s" + idx} />

      <header className="pz-top">
        <Link href="/" className="pz-brand" aria-label="Volver al inicio">
          <BrandMark size={34} />
          <div>NEXO ROSA<small>EIRA SYSTEM</small></div>
        </Link>
        <span className="pz-tag" key={"t" + idx}>{slides[idx].tag}</span>
        <div className="pz-meta">
          <span className="pz-num">{String(idx + 1).padStart(2, "0")}<small>/{String(slides.length).padStart(2, "0")}</small></span>
          <span className="pz-clock" ref={time}>0:00 / {clock(TOTAL)}</span>
          <button type="button" className="pz-icon" aria-label="Pantalla completa" onClick={() => root.current?.requestFullscreen?.().catch(() => {})}><Maximize size={16} /></button>
          <Link href="/" className="pz-icon" aria-label="Salir de la presentación"><X size={16} /></Link>
        </div>
      </header>

      <div className="pz-stage" ref={stage}>
        {slides.map((s, i) => (
          <section className={"pz-slide" + (i === idx ? " on" : i === prev ? " out" : "") + (s.center ? " center" : "")} key={s.key} aria-hidden={i !== idx}>
            <div className="pz-copy">
              <span className="pz-kicker pz-r" style={{ "--d": 0 } as React.CSSProperties}><i />{s.tag}</span>
              {s.body(i === idx)}
              {i === 0 && !started && (
                <button type="button" className="primary big pz-start pz-r" style={{ "--d": 14 } as React.CSSProperties} onClick={toggle}>
                  <Play size={18} /> Iniciar presentación · {clock(TOTAL)}
                </button>
              )}
            </div>
          </section>
        ))}
      </div>

      <footer className="pz-bottom">
        <div className="pz-bars">
          {slides.map((s, i) => (
            <button type="button" key={s.key} style={{ flexGrow: s.secs }} className={i === idx ? "on" : ""} aria-label={`Ir a ${s.tag}`} onClick={() => go(i)}>
              <i ref={(el) => { fills.current[i] = el; }} />
            </button>
          ))}
        </div>
        <div className="pz-controls">
          <small>Prototipo con datos sintéticos</small>
          <div>
            <button type="button" className="pz-icon" aria-label="Anterior" onClick={() => go(idx - 1)} disabled={idx === 0}><ChevronLeft size={18} /></button>
            <button type="button" className="pz-icon play" aria-label={playing ? "Pausar" : "Reproducir"} onClick={toggle}>
              {ended ? <RotateCcw size={18} /> : playing ? <Pause size={18} /> : <Play size={18} />}
            </button>
            <button type="button" className="pz-icon" aria-label="Siguiente" onClick={() => go(idx + 1)} disabled={idx === slides.length - 1}><ChevronRight size={18} /></button>
          </div>
          <small className="pz-hint">← → cambiar · espacio reproducir · F pantalla completa</small>
        </div>
      </footer>
    </div>
  );
}
