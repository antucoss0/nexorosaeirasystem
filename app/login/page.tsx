"use client";
import { useState, type FormEvent } from "react";
import { ArrowRight, HeartHandshake, ShieldCheck, WifiOff } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
const demos = [
  ["brigadista", "Brigadista"],
  ["medico", "Médico"],
  ["laboratorio", "Laboratorio"],
  ["municipio", "Enlace municipal"],
  ["admin", "Administración"],
];
export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function login(e?: FormEvent, demo?: string) {
    e?.preventDefault();
    if (!navigator.onLine || localStorage.getItem("eira-offline") === "true") {
      setError("Desactiva Offline simulado y conéctate para iniciar sesión.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: demo ? `${demo}@eira.mx` : email,
          password: demo ? "eira2026" : password,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw Error(data.error);
      location.href =
        data.user.role === "captura" ? "/campo" : "/admin/jornadas";
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo conectar");
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <section className="login-story">
        <div className="brand">
          <BrandMark />
          <div>
            NEXO ROSA<small>EIRA SYSTEM</small>
          </div>
        </div>
        <div className="login-headline">
          <span className="eyebrow light">TECNOLOGÍA CON PROPÓSITO</span>
          <h1>
            Más cerca.
            <br />
            Más unidas.
            <br />
            <em>Mejor cuidadas.</em>
          </h1>
          <p>
            Una conexión que transforma el cuidado de las mujeres. En cada
            comunidad, con o sin internet.
          </p>
        </div>
        <div className="story-bottom">
          <HeartHandshake size={30} />
          <span>
            Un mismo cuidado.
            <br />
            <strong>Un expediente único.</strong>
          </span>
          <span className="edition">
            JALISCO, MÉXICO
            <br />
            EDICIÓN 2026
          </span>
        </div>
      </section>
      <section className="login-form-side">
        <div className="login-form">
          <span className="eyebrow">BIENVENIDA A NEXO ROSA</span>
          <h2>
            El cuidado empieza
            <br />
            con una conexión.
          </h2>
          <p className="subtle">Ingresa a tu espacio de trabajo EIRA.</p>
          <form onSubmit={(e) => void login(e)}>
            <label>
              Correo electrónico
              <input
                type="email"
                required
                autoComplete="username"
                placeholder="tu.nombre@eira.mx"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label>
              Contraseña
              <input
                type="password"
                required
                autoComplete="current-password"
                placeholder="Ingresa tu contraseña"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <button className="primary full" disabled={busy}>
              {busy ? "Conectando…" : "Iniciar sesión"}
              <ArrowRight size={18} />
            </button>
          </form>
          <div className="demo-separator">EXPLORA EL SISTEMA</div>
          <p className="demo-caption">
            Acceso de demostración · elige tu perfil
          </p>
          <div className="demo-grid">
            {demos.map(([id, label]) => (
              <button
                disabled={busy}
                key={id}
                onClick={() => void login(undefined, id)}
              >
                {label}
                <ArrowRight size={14} />
              </button>
            ))}
          </div>
          <div className="login-note">
            <ShieldCheck size={18} />
            <span>
              Entorno de demostración. Solo datos sintéticos.
              <br />
              Contraseña de todos los perfiles: <strong>eira2026</strong>
            </span>
          </div>
          <p className="subtle tiny">
            <WifiOff size={13} /> El primer acceso requiere conexión a internet.
          </p>
        </div>
        <footer>© 2026 EIRA · Innovación que une.</footer>
      </section>
    </main>
  );
}
