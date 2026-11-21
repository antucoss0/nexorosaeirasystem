import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalized,
  jaroWinkler,
  scoreMatch,
  candidates,
  MATCH_THRESHOLD,
} from "../lib/matching";
test("normalization ignores accents, case and repeated spaces", () => {
  assert.equal(
    normalized("  MARÍA  Guadalupe López "),
    "maria guadalupe lopez",
  );
  assert.equal(normalized(null), "");
});
test("Jaro-Winkler handles identity, transpositions, unrelated and empty names", () => {
  assert.equal(jaroWinkler("maria", "maria"), 1);
  assert.ok(jaroWinkler("martha", "marhta") > 0.95);
  assert.equal(jaroWinkler("abc", "xyz"), 0);
  assert.equal(jaroWinkler("", ""), 0);
  assert.equal(jaroWinkler("maria", ""), 0);
});
const patient = {
  id: "EIRA-MX-001",
  nombre_completo: "María Guadalupe López",
  fecha_nacimiento: "1985-04-12",
  telefono: "3411234567",
  municipio: "Zapotlán el Grande",
  curp_opcional: "LOGM850412MJCPPR01",
};
test("typed unaccented seeded name exceeds threshold with human-readable reasons", () => {
  const result = scoreMatch(
    { nombre_normalizado: "maria guadalupe lopez" },
    patient,
  );
  assert.ok(result.score >= MATCH_THRESHOLD);
  assert.deepEqual(result.reasons, ["nombre 100% similar"]);
  assert.equal(
    candidates({ nombre_completo: "Maria Guadalupe Lopez" }, [patient])[0]
      .patient.id,
    patient.id,
  );
});
test("DOB, international phone suffix and municipality add independent evidence; score is capped", () => {
  const result = scoreMatch(
    { ...patient, telefono: "+52 (341) 123-4567", curp_opcional: "" },
    patient,
  );
  assert.equal(result.score, 1);
  assert.ok(result.reasons.includes("misma fecha de nacimiento"));
  assert.ok(result.reasons.includes("mismos últimos 7 dígitos de teléfono"));
  assert.ok(result.reasons.includes("mismo municipio"));
});
test("partial DOB and CURP evidence is explicit and symmetric", () => {
  const draft = {
    ...patient,
    fecha_nacimiento: "1985-04",
    curp_opcional: "LOGM850412",
    telefono: "",
  };
  const result = scoreMatch(draft, patient);
  assert.ok(result.reasons.includes("mismo año y mes de nacimiento"));
  assert.ok(result.reasons.includes("CURP parcial coincidente"));
  assert.equal(
    scoreMatch(draft, patient).score,
    scoreMatch(patient, draft).score,
  );
  assert.ok(
    scoreMatch({ fecha_nacimiento: "1985" }, patient).reasons.includes(
      "mismo año de nacimiento",
    ),
  );
  assert.ok(
    scoreMatch({ fecha_nacimiento: "1984-04-12" }, patient).reasons.includes(
      "mismo día y mes de nacimiento",
    ),
  );
});
test("exact complete CURP identifies a candidate even if name differs", () => {
  const result = scoreMatch(
    { nombre_completo: "Otra identidad", curp_opcional: "logm850412mjcppr01" },
    patient,
  );
  assert.equal(result.score, 1);
  assert.ok(result.reasons.includes("misma CURP"));
  assert.ok(
    scoreMatch({ curp_opcional: "X" }, { curp_opcional: "X" }).score <
      MATCH_THRESHOLD,
  );
});
test("missing or unrelated data and short phone fragments never create a candidate", () => {
  assert.deepEqual(scoreMatch({}, {}), {
    score: 0,
    nameSimilarity: 0,
    reasons: [],
  });
  assert.equal(candidates({}, [patient]).length, 0);
  assert.equal(
    candidates(
      {
        nombre_completo: "Ximena Torres",
        telefono: "4567",
        municipio: "Tuxpan",
      },
      [patient],
    ).length,
    0,
  );
  assert.equal(candidates(patient, []).length, 0);
});
test("candidates exclude self and aliases, sort strongest first and never mutate input", () => {
  const alias = { ...patient, id: "alias", merged_into: patient.id };
  const other = {
    ...patient,
    id: "other",
    nombre_completo: "Maria Guadalupe Lopez Ruiz",
    telefono: "",
    fecha_nacimiento: "",
  };
  const input = [other, alias, patient];
  const result = candidates(
    { nombre_completo: "Maria Guadalupe Lopez" },
    input,
  );
  assert.deepEqual(
    result.map((c) => c.patient.id),
    [patient.id, "other"],
  );
  assert.equal(input[0], other);
  assert.equal(candidates(patient, [patient, alias]).length, 0);
});
