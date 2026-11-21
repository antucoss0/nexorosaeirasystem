export const normalized = (s: unknown) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
export function jaroWinkler(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const range = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aa = new Set<number>(),
    bb = new Set<number>();
  for (let i = 0; i < a.length; i++)
    for (
      let j = Math.max(0, i - range);
      j < Math.min(b.length, i + range + 1);
      j++
    )
      if (!bb.has(j) && a[i] === b[j]) {
        aa.add(i);
        bb.add(j);
        break;
      }
  const m = aa.size;
  if (!m) return 0;
  const av = [...aa].map((i) => a[i]),
    bv = [...bb].sort((x, y) => x - y).map((i) => b[i]);
  const t = av.filter((c, i) => c !== bv[i]).length / 2;
  const j = (m / a.length + m / b.length + (m - t) / m) / 3;
  let p = 0;
  while (p < Math.min(4, a.length, b.length) && a[p] === b[p]) p++;
  return j > 0.7 ? j + p * 0.1 * (1 - j) : j;
}
export function scoreMatch(a: Record<string, any>, b: Record<string, any>) {
  const name = jaroWinkler(
    normalized(a.nombre_completo || a.nombre_normalizado),
    normalized(b.nombre_completo || b.nombre_normalizado),
  );
  let score = name >= 0.75 ? name * 0.76 : 0;
  const reasons: string[] = [];
  if (name >= 0.75) reasons.push(`nombre ${Math.round(name * 100)}% similar`);
  const exact = (key: string) =>
    !!a[key] && !!b[key] && normalized(a[key]) === normalized(b[key]);
  if (exact("fecha_nacimiento")) {
    score += 0.18;
    reasons.push("misma fecha de nacimiento");
  } else {
    const ad = String(a.fecha_nacimiento || ""),
      bd = String(b.fecha_nacimiento || "");
    if (
      /^\d{4}/.test(ad) &&
      /^\d{4}/.test(bd) &&
      ad.slice(0, 4) === bd.slice(0, 4)
    ) {
      const month =
        ad.length >= 7 && bd.length >= 7 && ad.slice(0, 7) === bd.slice(0, 7);
      score += month ? 0.08 : 0.05;
      reasons.push(
        month ? "mismo año y mes de nacimiento" : "mismo año de nacimiento",
      );
    } else if (
      ad.length === 10 &&
      bd.length === 10 &&
      ad.slice(5) === bd.slice(5)
    ) {
      score += 0.07;
      reasons.push("mismo día y mes de nacimiento");
    }
  }
  const digits = (s: unknown) => String(s || "").replace(/\D/g, "");
  const ap = digits(a.telefono),
    bp = digits(b.telefono);
  if (ap.length >= 7 && bp.length >= 7 && ap.slice(-7) === bp.slice(-7)) {
    score += 0.17;
    reasons.push("mismos últimos 7 dígitos de teléfono");
  }
  if (exact("municipio")) {
    score += 0.06;
    reasons.push("mismo municipio");
  }
  const ac = normalized(a.curp_opcional).replace(/\s/g, ""),
    bc = normalized(b.curp_opcional).replace(/\s/g, "");
  if (/^[a-z0-9]{18}$/.test(ac) && ac === bc) {
    score = 1;
    reasons.push("misma CURP");
  } else if (
    Math.min(ac.length, bc.length) >= 10 &&
    (ac.startsWith(bc) || bc.startsWith(ac))
  ) {
    score += 0.15;
    reasons.push("CURP parcial coincidente");
  }
  return { score: Math.min(1, score), nameSimilarity: name, reasons };
}
export const MATCH_THRESHOLD = 0.7;
export function candidates<T extends Record<string, any>>(
  draft: Record<string, any>,
  patients: T[],
) {
  return patients
    .filter((p) => !p.merged_into && p.id !== draft.id)
    .map((patient) => ({ patient, ...scoreMatch(draft, patient) }))
    .filter((c) => c.score >= MATCH_THRESHOLD)
    .sort((a, b) => b.score - a.score);
}
