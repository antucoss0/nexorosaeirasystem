import Link from "next/link";
import { ChangeRequestLink } from "@/components/change-request-link";
import {
  HeartHandshake,
  ShieldCheck,
  WifiOff,
  Users,
  ArrowRight,
} from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
export default function Home() {
  return (
    <main className="landing">
      <header>
        <Link href="/" className="brand dark">
          <BrandMark />
          <div>
            NEXO ROSA<small>EIRA SYSTEM</small>
          </div>
        </Link>
        <nav>
          <Link href="/guia">Guía de demostración</Link>
          <Link href="/login" className="primary">
            Ingresar <ArrowRight size={16} />
          </Link>
        </nav>
      </header>
      <section className="landing-hero">
        <div>
          <span className="eyebrow">SALUD QUE NOS UNE · EIRA</span>
          <h1>
            Conectamos salud,
            <br />
            <em>fortalecemos comunidades.</em>
          </h1>
          <p>
            Un mismo cuidado. Información que acompaña a cada persona, conecta a
            los equipos en campo y hace visible el impacto compartido.
          </p>
          <div className="button-row">
            <Link className="primary" href="/login">
              Explorar la plataforma <ArrowRight size={17} />
            </Link>
            <Link href="/guia">Conocer los cuatro retos →</Link>
          </div>
          <small>
            Demostración con datos sintéticos. No usar información real.
          </small>
        </div>
        <aside>
          <HeartHandshake size={96} strokeWidth={1.2} />
          <span>CUIDADO · COMUNIDAD · CONFIANZA</span>
          <h2>
            Innovación que cuida,
            <br />
            tecnología que une
          </h2>
          <p>
            De la primera visita al documento entregado. Un vínculo humano, con
            respaldo digital.
          </p>
        </aside>
      </section>
      <section className="landing-values">
        {[
          [
            WifiOff,
            "Cerca, incluso sin conexión",
            "Captura local con sincronización y decisiones humanas de identidad.",
          ],
          [
            ShieldCheck,
            "Privacidad como cuidado",
            "Permisos, trazabilidad y entrega de documentos con verificación.",
          ],
          [
            Users,
            "Impacto sin duplicar personas",
            "Fuentes integradas, calidad revisada e indicadores transparentes.",
          ],
        ].map(([Icon, title, body]: any) => (
          <article key={title}>
            <Icon size={26} />
            <h3>{title}</h3>
            <p>{body}</p>
          </article>
        ))}
      </section>
      <footer>
        EIRA · Federico del Toro 83 int 205, Centro, Ciudad Guzmán, Jalisco,
        C.P. 49000.
        <br />
        Tel. 3414108111 y 3411596782 · hola@eiraac.org
        <br />
        <ChangeRequestLink />
      </footer>
    </main>
  );
}
