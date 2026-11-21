"use client";
import { useEffect, useState } from "react";
import { BrandMark } from "./brand-mark";

/** Runs before paint: skips the intro when it was already seen in this tab. */
export const introBootScript = `try{var q=location.search.indexOf("intro=1")>-1;if(!q&&(sessionStorage.getItem("nexo-intro")||navigator.webdriver||location.pathname.indexOf("/resultado")===0||matchMedia("(prefers-reduced-motion: reduce)").matches))document.documentElement.dataset.intro="skip"}catch(e){}`;

const WORD = "NEXO ROSA".split("");

export function Intro() {
  const [phase, setPhase] = useState<"play" | "leave" | "done">("play");
  useEffect(() => {
    if (document.documentElement.dataset.intro === "skip") {
      setPhase("done");
      return;
    }
    try {
      sessionStorage.setItem("nexo-intro", "1");
    } catch {}
    const leave = setTimeout(() => setPhase("leave"), 3700);
    const done = setTimeout(() => setPhase("done"), 4500);
    return () => {
      clearTimeout(leave);
      clearTimeout(done);
    };
  }, []);
  useEffect(() => {
    if (phase !== "leave") return;
    const t = setTimeout(() => setPhase("done"), 800);
    return () => clearTimeout(t);
  }, [phase]);
  if (phase === "done") return null;
  return (
    <div
      className={"intro-overlay" + (phase === "leave" ? " leaving" : "")}
      role="button"
      tabIndex={0}
      aria-label="Saltar introducción"
      onClick={() => setPhase("leave")}
      onKeyDown={() => setPhase("leave")}
    >
      <div className="intro-stage">
        <span className="intro-ring r1" />
        <span className="intro-ring r2" />
        <span className="intro-ring r3" />
        <span className="intro-orbit">
          <i />
        </span>
        <span className="intro-flare" />
        <div className="intro-logo">
          <BrandMark size={190} />
        </div>
        {Array.from({ length: 14 }).map((_, i) => (
          <span
            key={i}
            className="intro-spark"
            style={
              {
                "--a": `${(360 / 14) * i}deg`,
                "--d": `${90 + ((i * 37) % 70)}px`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>
      <div className="intro-word" aria-hidden="true">
        {WORD.map((c, i) => (
          <span
            key={i}
            className={i > 4 ? "pink" : ""}
            style={{ animationDelay: `${1.75 + i * 0.055}s` }}
          >
            {c === " " ? "\u00a0" : c}
          </span>
        ))}
      </div>
      <div className="intro-sub">
        <i />
        EIRA SYSTEM
        <i />
      </div>
      <svg className="intro-pulse" viewBox="0 0 600 60" fill="none">
        <path
          d="M0 30h210l14-18 16 36 18-48 20 54 14-24h308"
          pathLength={1}
          stroke="url(#ip)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <defs>
          <linearGradient id="ip" x1="0" x2="600" gradientUnits="userSpaceOnUse">
            <stop stopColor="#ff1e8a" stopOpacity="0" />
            <stop offset="0.45" stopColor="#ff1e8a" />
            <stop offset="0.55" stopColor="#fff" />
            <stop offset="1" stopColor="#ff1e8a" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>
      <p className="intro-tag">Conectamos salud, fortalecemos comunidades</p>
      <span className="intro-skip">Toca para saltar</span>
    </div>
  );
}
