import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
process.env.DATA_DIR = mkdtempSync(join(process.cwd(), "data-test-"));
const brigadista = {
  id: "brigadista",
  role: "captura" as const,
  email: "brigadista@eira.mx",
  nombre: "Brigadista",
  municipio: null,
};
const admin = { ...brigadista, id: "admin", role: "admin" as const };
function op(
  table: any,
  entityId: string,
  type: any,
  patch: any,
  baseVersion = 0,
) {
  return {
    opId: randomUUID(),
    table,
    entityId,
    type,
    patch,
    baseVersion,
    createdAt: new Date().toISOString(),
  };
}
test("foundation sync contract", async (t) => {
  const { applyOperations, pull } = await import("../lib/sync");
  const { db } = await import("../lib/db");
  await t.test("seed has expected synthetic counts", () => {
    assert.equal(
      (db.prepare("SELECT count(*) n FROM patients").get() as any).n,
      10,
    );
    assert.equal(
      (db.prepare("SELECT count(*) n FROM attentions").get() as any).n,
      18,
    );
    assert.equal(
      (db.prepare("SELECT count(*) n FROM jornadas").get() as any).n,
      3,
    );
  });
  await t.test("empty push and empty pull", () => {
    assert.deepEqual(applyOperations(brigadista, []), {
      results: [],
      remaps: {},
    });
    assert.equal(pull(admin, "2999-01-01").patients.length, 0);
  });
  let id = "";
  await t.test(
    "create normalizes, remaps foreign keys and retries idempotently",
    () => {
      const create = op("patients", "EIRA-TMP-test", "create", {
        nombre_completo: "  MARÍA   Pérez ",
        fecha_nacimiento: "1981-01-01",
        municipio: "Tuxpan",
      });
      const attention = op("attentions", "ATT-test", "create", {
        paciente_uuid: "EIRA-TMP-test",
        jornada_id: "JOR-001",
        programa: "Mama",
        categoria: "Estudio",
        tipo_servicio: "Revisión",
        fecha: "2026-06-15",
      });
      const first = applyOperations(brigadista, [create, attention]);
      id = first.remaps["EIRA-TMP-test"];
      assert.match(id, /^EIRA-MX-/);
      assert.equal(first.results[0].record.nombre_normalizado, "maria perez");
      assert.equal(first.results[1].record.paciente_uuid, id);
      assert.deepEqual(applyOperations(brigadista, [create, attention]), first);
    },
  );
  await t.test(
    "stale same-field update conflicts, disjoint update merges",
    () => {
      applyOperations(brigadista, [
        op("patients", id, "update", { telefono: "123" }, 1),
      ]);
      const conflict = applyOperations(brigadista, [
        op("patients", id, "update", { telefono: "456" }, 1),
      ]);
      assert.equal(conflict.results[0].status, "conflict");
      assert.deepEqual(conflict.results[0].fields, ["telefono"]);
      const merge = applyOperations(brigadista, [
        op("patients", id, "update", { email: "demo@example.org" }, 1),
      ]);
      assert.equal(merge.results[0].record.telefono, "123");
      assert.equal(merge.results[0].record.version, 3);
    },
  );
  await t.test(
    "invalid input rolls back batch and missing records error",
    () => {
      assert.throws(() =>
        applyOperations(brigadista, [
          op("patients", "bad", "create", {
            nombre_completo: "Inválida",
            fecha_nacimiento: "2026-02-30",
            municipio: "Tuxpan",
          }),
        ]),
      );
      assert.throws(() =>
        applyOperations(brigadista, [
          op("patients", "missing", "update", { telefono: "123" }, 1),
        ]),
      );
      assert.throws(() =>
        applyOperations(brigadista, [op("patients", id, "update", {}, 3)]),
      );
      assert.throws(() =>
        applyOperations(brigadista, [
          op("users", "admin", "update", { role: "admin" }, 1),
        ]),
      );
    },
  );
  await t.test(
    "RBAC protects jornadas, clinical authorization and municipal scope",
    () => {
      assert.throws(
        () =>
          applyOperations(brigadista, [
            op(
              "jornadas",
              "JOR-001",
              "update",
              { estado_general: "Activa" },
              1,
            ),
          ]),
        /permiso/,
      );
      assert.throws(
        () =>
          applyOperations(brigadista, [
            op(
              "attentions",
              "ATT-test",
              "update",
              { estado_pap: "autorizado_medico" },
              1,
            ),
          ]),
        /médico/,
      );
      const municipal = {
        ...brigadista,
        id: "municipio",
        role: "municipio" as const,
        municipio: "Zapotlán el Grande",
      };
      assert.equal(pull(municipal, "1970").jornadas.length, 1);
      assert.equal(pull(municipal, "1970").patients.length, 0);
      assert.throws(
        () =>
          applyOperations(municipal, [
            op("jornadas", "JOR-002", "update", { sede: "Otra" }, 1),
          ]),
        /municipio/,
      );
      assert.throws(
        () =>
          applyOperations(municipal, [
            op(
              "jornadas",
              "JOR-001",
              "update",
              {
                requisitos: [
                  { clave: "carta", nombre: "Carta", estado: "aprobado" },
                ],
              },
              1,
            ),
          ]),
        /aprueba/,
      );
      const medico = {
        ...brigadista,
        id: "medico",
        role: "consulta_clinica" as const,
      };
      assert.equal(
        applyOperations(medico, [
          op(
            "attentions",
            "ATT-test",
            "update",
            { estado_pap: "autorizado_medico" },
            1,
          ),
        ]).results[0].status,
        "applied",
      );
    },
  );
  await t.test("audit is append-only at database level", () => {
    assert.throws(
      () => db.prepare("UPDATE audit_logs SET accion=?").run("changed"),
      /append-only/,
    );
    assert.throws(
      () => db.prepare("DELETE FROM audit_logs").run(),
      /append-only/,
    );
  });
  db.close();
  rmSync(process.env.DATA_DIR!, { recursive: true });
});
