import { ShieldCheck } from "lucide-react";
export default function Resultado() {
  return (
    <main className="portal">
      <div className="brand dark">
        <span className="brand-mark">
          n<span>r</span>
        </span>
        <div>
          NEXO ROSA<small>EIRA SYSTEM</small>
        </div>
      </div>
      <section className="panel empty">
        <ShieldCheck size={44} />
        <span className="eyebrow">PORTAL PERSONAL</span>
        <h1>Un espacio seguro para ti.</h1>
        <p>
          La consulta de resultados se habilitará en una próxima fase.
          <br />
          Este enlace no permite consultar información clínica.
        </p>
        <a className="primary" href="/login">
          Ir al inicio
        </a>
      </section>
      <p className="subtle">
        Si necesitas acompañamiento, contacta a tu equipo EIRA.
      </p>
    </main>
  );
}
