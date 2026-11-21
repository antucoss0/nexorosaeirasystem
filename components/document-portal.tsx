"use client";
import { useEffect, useState } from "react";
import {
  ShieldCheck,
  LockKeyhole,
  Download,
  HeartHandshake,
} from "lucide-react";
import { BrandMark } from "./brand-mark";
export function DocumentPortal({ token }: { token: string }) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [method, setMethod] = useState("fecha_nacimiento");
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState("");
  useEffect(() => {
    fetch("/api/portal/" + encodeURIComponent(token), { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setAvailable(d.available))
      .catch(() =>
        setError("No pudimos conectar. Intenta de nuevo o contacta a EIRA."),
      );
  }, [token]);
  return (
    <main className="portal secure-portal">
      <div className="brand dark">
        <BrandMark />
        <div>
          NEXO ROSA<small>EIRA SYSTEM</small>
        </div>
      </div>
      <section className="panel portal-card">
        <div className="portal-lock">
          <ShieldCheck size={34} />
        </div>
        <span className="eyebrow">PORTAL PERSONAL · ACCESO PROTEGIDO</span>
        <h1>
          {url ? "Tu documento, en tus manos." : "Un espacio seguro para ti."}
        </h1>
        {url ? (
          <>
            <p>
              Identidad verificada. Puedes abrir o descargar tu documento
              durante los próximos 10 minutos o hasta el vencimiento del enlace.
            </p>
            <div className="portal-buttons">
              <a className="primary" href={url} download>
                <Download size={18} />
                Descargar documento
              </a>
              <a href={url + "?view=1"} target="_blank" rel="noreferrer">
                Ver documento
              </a>
            </div>
            <p className="portal-help">
              Al terminar, cierra esta ventana, especialmente si el dispositivo
              es compartido.
            </p>
          </>
        ) : available === false ? (
          <p className="correction-note">
            Enlace no disponible. Puede haber vencido, sido revocado o
            bloqueado. Contacta a EIRA para recibir acompañamiento.
          </p>
        ) : (
          <>
            <p>
              No necesitas una cuenta. Verifica un dato de identidad para abrir
              el documento que EIRA tiene para ti.
            </p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError("");
                try {
                  const r = await fetch(
                    "/api/portal/" + encodeURIComponent(token),
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ method, value }),
                    },
                  );
                  const d = await r.json();
                  if (!r.ok) {
                    if ([410, 429].includes(r.status)) setAvailable(false);
                    throw Error(d.error);
                  }
                  setUrl(d.downloadUrl);
                  setValue("");
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label>
                Cómo verificar tu identidad
                <select
                  aria-label="Método de verificación"
                  value={method}
                  onChange={(e) => {
                    setMethod(e.target.value);
                    setValue("");
                  }}
                >
                  <option value="fecha_nacimiento">Fecha de nacimiento</option>
                  <option value="telefono">
                    Últimos 4 dígitos de tu teléfono
                  </option>
                </select>
              </label>
              <label>
                {method === "fecha_nacimiento"
                  ? "Tu fecha de nacimiento"
                  : "Últimos 4 dígitos"}
                <input
                  aria-label="Dato de identidad"
                  required
                  type={method === "fecha_nacimiento" ? "date" : "text"}
                  inputMode={method === "telefono" ? "numeric" : undefined}
                  pattern={method === "telefono" ? "[0-9]{4}" : undefined}
                  maxLength={method === "telefono" ? 4 : undefined}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                />
              </label>
              <button className="primary" disabled={busy || available !== true}>
                <LockKeyhole size={17} />
                {busy ? "Verificando…" : "Verificar identidad"}
              </button>
            </form>
            <p className="portal-help">
              Por tu seguridad, el enlace se bloquea después de cinco intentos
              incorrectos. Nunca compartas este enlace.
            </p>
          </>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <footer>
          <HeartHandshake size={20} />
          <p>
            ¿Necesitas apoyo? Estamos para acompañarte.
            <br />
            <strong>EIRA · 3414108111 · 3411596782</strong>
            <br />
            hola@eiraac.org
          </p>
        </footer>
      </section>
      <p className="subtle">Tu privacidad es parte del cuidado.</p>
    </main>
  );
}
