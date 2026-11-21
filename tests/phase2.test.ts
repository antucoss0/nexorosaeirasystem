import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  schemas,
  prefill,
  birads,
  bethesda,
  findings,
  ultrasoundDefault,
} from "../lib/clinical";
import type { User } from "../lib/rbac";
import type { Operation } from "../lib/sync";
process.env.DATA_DIR = mkdtempSync(join(process.cwd(), "data-test-"));
const capture: User = {
  id: "brigadista",
  email: "brigadista@eira.mx",
  nombre: "Brigadista",
  role: "captura",
  municipio: null,
};
const admin: User = { ...capture, id: "admin", role: "admin" };
const doctor: User = { ...capture, id: "medico", role: "consulta_clinica" };
const lab: User = { ...capture, id: "laboratorio", role: "laboratorio" };
const operation = (
  table: Operation["table"],
  entityId: string,
  patch: Record<string, any>,
  baseVersion = 0,
  type: Operation["type"] = baseVersion ? "update" : "create",
): Operation => ({
  table,
  entityId,
  patch,
  baseVersion,
  type,
  opId: randomUUID(),
  createdAt: new Date().toISOString(),
});
test("phase 2 clinical, decisions and conflict contracts", async (t) => {
  const { applyOperations, pull, SyncError } = await import("../lib/sync");
  const { db, decode } = await import("../lib/db");
  t.after(() => {
    db.close();
    rmSync(process.env.DATA_DIR!, { recursive: true, force: true });
  });
  const get = (table: string, id: string) =>
    decode(db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id));
  const apply = (user: User, op: Operation) =>
    applyOperations(user, [op]).results[0];
  const forbidden = (fn: () => unknown) =>
    assert.throws(
      fn,
      (e: unknown) => e instanceof SyncError && e.status === 403,
    );
  const attention = (
    form_data: Record<string, any>,
    patient = "EIRA-MX-001",
  ) => ({
    paciente_uuid: patient,
    jornada_id: "JOR-001",
    programa: "Mama",
    categoria: "Estudio",
    tipo_servicio: "Revisión Mamaria",
    fecha: "2026-06-15",
    visit_id: randomUUID(),
    form_data,
  });
  await t.test(
    "schemas cover every numbered item and all result choices; prefill is valid",
    () => {
      for (const [kind, count] of [
        ["mamaria", 24],
        ["cervix", 31],
      ] as const) {
        const fields = schemas[kind].flatMap((s) => s.fields);
        for (let i = 1; i <= count; i++)
          assert.ok(
            fields.some((f) => f.key === `f${i}`),
            `${kind} ${i}`,
          );
        assert.equal(new Set(fields.map((f) => f.key)).size, fields.length);
        const data = prefill(kind, get("patients", "EIRA-MX-001"));
        for (const key of Object.keys(data))
          assert.ok(key === "kind" || fields.some((f) => f.key === key), key);
      }
      assert.equal(birads.length, 6);
      assert.equal(bethesda.length, 11);
      assert.equal(findings.length, 14);
      assert.equal(
        prefill("mamaria", get("patients", "EIRA-MX-001")).f20,
        ultrasoundDefault,
      );
    },
  );
  await t.test(
    "capture stores a prefilled study; results are only editable by doctor/laboratory",
    () => {
      const created = apply(
        capture,
        operation(
          "attentions",
          "study-mama",
          attention(prefill("mamaria", get("patients", "EIRA-MX-001"))),
        ),
      );
      assert.equal(created.record.categoria, "Estudio");
      for (const user of [capture, admin])
        forbidden(() =>
          apply(
            user,
            operation(
              "attentions",
              "study-mama",
              { form_data: { kind: "mamaria", f22: birads[1] } },
              1,
            ),
          ),
        );
      assert.equal(
        apply(
          doctor,
          operation(
            "attentions",
            "study-mama",
            { form_data: { kind: "mamaria", f22: birads[1] } },
            1,
          ),
        ).record.form_data.f22,
        birads[1],
      );
      assert.equal(
        apply(
          lab,
          operation(
            "attentions",
            "study-mama",
            { form_data: { kind: "mamaria", f22: birads[2] } },
            2,
          ),
        ).record.form_data.f22,
        birads[2],
      );
      assert.equal(
        get("attentions", "study-mama").form_data.f20,
        ultrasoundDefault,
      );
      forbidden(() =>
        apply(
          lab,
          operation(
            "attentions",
            "study-mama",
            { form_data: { f2: "No puede cambiar identificación" } },
            3,
          ),
        ),
      );
      forbidden(() =>
        apply(
          lab,
          operation("attentions", "study-lab", attention({ kind: "mamaria" })),
        ),
      );
      assert.throws(() =>
        apply(
          capture,
          operation("attentions", "study-mama", { form_data: { kind: "" } }, 3),
        ),
      );
      assert.throws(() =>
        apply(
          capture,
          operation(
            "attentions",
            "study-mama",
            { form_data: { kind: "cervix" } },
            3,
          ),
        ),
      );
      assert.throws(() =>
        apply(
          capture,
          operation(
            "attentions",
            "study-unknown",
            attention({ f22: birads[1] }),
          ),
        ),
      );
      assert.throws(() =>
        apply(
          capture,
          operation(
            "attentions",
            "study-option",
            attention({ kind: "mamaria", cartilla: "Inventado" }),
          ),
        ),
      );
      assert.throws(() =>
        apply(
          capture,
          operation(
            "attentions",
            "study-extra",
            attention({ kind: "mamaria", unknown: "valor" }),
          ),
        ),
      );
      assert.throws(() =>
        apply(
          capture,
          operation("attentions", "study-null", attention(null as any)),
        ),
      );
    },
  );
  await t.test(
    "cervical multiselect capture and restricted Bethesda findings round-trip",
    () => {
      const field = schemas.cervix
        .flatMap((s) => s.fields)
        .find((f) => f.key === "f12")!;
      apply(
        capture,
        operation("attentions", "study-cervix", {
          ...attention({
            ...prefill("cervix", get("patients", "EIRA-MX-001")),
            f12: field.options!.slice(0, 2),
          }),
          tipo_servicio: "Citología Cervical",
        }),
      );
      forbidden(() =>
        apply(
          capture,
          operation(
            "attentions",
            "study-cervix",
            { form_data: { f27: bethesda[0] } },
            1,
          ),
        ),
      );
      const result = apply(
        lab,
        operation(
          "attentions",
          "study-cervix",
          {
            form_data: {
              f27: bethesda[0],
              f27_1: findings.slice(0, 2),
              f30_2: [],
            },
          },
          1,
        ),
      );
      assert.deepEqual(result.record.form_data.f27_1, findings.slice(0, 2));
      assert.throws(() =>
        apply(
          lab,
          operation(
            "attentions",
            "study-cervix",
            { form_data: { f27_1: "No es arreglo" } },
            2,
          ),
        ),
      );
    },
  );
  await t.test(
    "clinical field conflicts merge disjoint edits and preserve all other answers on resolution",
    () => {
      apply(
        capture,
        operation(
          "attentions",
          "study-fields",
          attention({
            kind: "mamaria",
            f10: "inicial",
            f17: "sin antecedentes",
            f20: ultrasoundDefault,
          }),
        ),
      );
      apply(
        capture,
        operation(
          "attentions",
          "study-fields",
          { form_data: { f10: "servidor" } },
          1,
        ),
      );
      assert.equal(
        apply(
          capture,
          operation(
            "attentions",
            "study-fields",
            { form_data: { f17: "local compatible" } },
            1,
          ),
        ).status,
        "applied",
      );
      const conflict = apply(
        capture,
        operation(
          "attentions",
          "study-fields",
          { form_data: { f10: "local propuesto" } },
          1,
        ),
      );
      assert.deepEqual(conflict.fields, ["form_data.f10"]);
      const resolved = apply(
        admin,
        operation("decisions", "resolve-form", {
          action: "resolve_conflict",
          conflictId: conflict.conflictId,
          expectedVersion: 3,
          choices: { "form_data.f10": "client" },
        }),
      );
      assert.ok(resolved.affected.length);
      const record = get("attentions", "study-fields");
      assert.equal(record.form_data.f10, "local propuesto");
      assert.equal(record.form_data.f17, "local compatible");
      assert.equal(record.form_data.f20, ultrasoundDefault);
    },
  );
  let contactConflict: string;
  await t.test(
    "same-patient choice only adds attention, logs human evidence and is idempotent",
    () => {
      const before = (
        db.prepare("SELECT count(*) n FROM patients").get() as any
      ).n;
      const visit = operation("attentions", "new-visit", {
        ...attention({}),
        categoria: "Atención",
      });
      const choice = operation("decisions", "same-person", {
        action: "same_patient",
        patientId: "EIRA-MX-001",
        candidateIds: ["EIRA-MX-001", "EIRA-MX-002"],
      });
      const batch = applyOperations(capture, [visit, choice]);
      assert.deepEqual(applyOperations(capture, [visit, choice]), batch);
      assert.equal(
        (db.prepare("SELECT count(*) n FROM patients").get() as any).n,
        before,
      );
      assert.equal(get("attentions", "new-visit").paciente_uuid, "EIRA-MX-001");
      assert.equal(
        (
          db
            .prepare(
              "SELECT count(*) n FROM audit_logs WHERE accion='same_patient'",
            )
            .get() as any
        ).n,
        1,
      );
    },
  );
  await t.test(
    "different-person choice creates a stable new UUID and remaps attention plus decision",
    () => {
      const result = applyOperations(capture, [
        operation("patients", "EIRA-TMP-different", {
          nombre_completo: "María Guadalupe López",
          fecha_nacimiento: "1990-03-04",
          municipio: "Tuxpan",
        }),
        operation(
          "attentions",
          "different-visit",
          attention({}, "EIRA-TMP-different"),
        ),
        operation("decisions", "different-person", {
          action: "different_patient",
          patientId: "EIRA-TMP-different",
          candidateIds: ["EIRA-MX-001"],
        }),
      ]);
      assert.match(result.remaps["EIRA-TMP-different"], /^EIRA-MX-/);
      assert.equal(
        get("attentions", "different-visit").paciente_uuid,
        result.remaps["EIRA-TMP-different"],
      );
      assert.equal(
        get("decisions", "different-person").patientId,
        result.remaps["EIRA-TMP-different"],
      );
      assert.throws(() =>
        apply(
          capture,
          operation("decisions", "empty-candidates", {
            action: "same_patient",
            patientId: "EIRA-MX-001",
            candidateIds: [],
          }),
        ),
      );
      assert.throws(() =>
        apply(
          capture,
          operation("decisions", "wrong-candidate", {
            action: "same_patient",
            patientId: "EIRA-MX-001",
            candidateIds: ["EIRA-MX-002"],
          }),
        ),
      );
      assert.throws(() =>
        apply(
          capture,
          operation("decisions", "same-person", {
            action: "same_patient",
            patientId: "EIRA-MX-001",
            candidateIds: ["EIRA-MX-001"],
          }),
        ),
      );
    },
  );
  await t.test(
    "admin resolves contact fields explicitly, rejects stale/empty choices and remembers resolution",
    () => {
      apply(
        capture,
        operation("patients", "EIRA-MX-003", { telefono: "servidor" }, 1),
      );
      const conflict = apply(
        capture,
        operation(
          "patients",
          "EIRA-MX-003",
          { telefono: "local", email: "nuevo@example.test" },
          1,
        ),
      );
      contactConflict = conflict.conflictId;
      const choice = {
        action: "resolve_conflict",
        conflictId: contactConflict,
        expectedVersion: 2,
        choices: { telefono: "client", email: "server" },
      };
      forbidden(() =>
        apply(capture, operation("decisions", "forbidden-resolution", choice)),
      );
      assert.throws(() =>
        apply(
          admin,
          operation("decisions", "empty-resolution", {
            ...choice,
            choices: {},
          }),
        ),
      );
      assert.throws(() =>
        apply(
          admin,
          operation("decisions", "stale-resolution", {
            ...choice,
            expectedVersion: 1,
          }),
        ),
      );
      apply(admin, operation("decisions", "resolve-contact", choice));
      assert.equal(get("patients", "EIRA-MX-003").telefono, "local");
      assert.ok(pull(admin, "2999-01-01").resolved.includes("EIRA-MX-003"));
      assert.throws(() =>
        apply(admin, operation("decisions", "already-resolved", choice)),
      );
      apply(
        capture,
        operation(
          "patients",
          "EIRA-MX-003",
          { telefono: "servidor posterior" },
          3,
        ),
      );
      apply(
        capture,
        operation("patients", "EIRA-MX-003", { telefono: "otro local" }, 3),
      );
      assert.ok(!pull(admin, "2999-01-01").resolved.includes("EIRA-MX-003"));
    },
  );
  await t.test(
    "admin-only merge moves every attention, retains alias and redirects later offline references",
    () => {
      const otherBefore = (
        db
          .prepare("SELECT count(*) n FROM attentions WHERE paciente_uuid=?")
          .get("EIRA-MX-002") as any
      ).n;
      assert.ok(otherBefore > 0);
      const choice = {
        action: "merge_patients",
        patientId: "EIRA-MX-001",
        otherId: "EIRA-MX-002",
      };
      forbidden(() =>
        apply(capture, operation("decisions", "not-admin-merge", choice)),
      );
      apply(admin, operation("decisions", "merge-confirmed", choice));
      assert.equal(
        (
          db
            .prepare("SELECT count(*) n FROM attentions WHERE paciente_uuid=?")
            .get("EIRA-MX-002") as any
        ).n,
        0,
      );
      assert.equal(get("patients", "EIRA-MX-002").merged_into, "EIRA-MX-001");
      assert.ok(get("patients", "EIRA-MX-001").aliases.includes("EIRA-MX-002"));
      assert.equal(
        apply(
          capture,
          operation(
            "attentions",
            "late-offline-visit",
            attention({}, "EIRA-MX-002"),
          ),
        ).record.paciente_uuid,
        "EIRA-MX-001",
      );
      assert.throws(() =>
        apply(
          admin,
          operation("decisions", "self-merge", {
            ...choice,
            otherId: choice.patientId,
          }),
        ),
      );
    },
  );
  await t.test(
    "different-person dismissal is persisted and all decisions/audit remain immutable",
    () => {
      apply(
        admin,
        operation("decisions", "distinct-pair", {
          action: "dismiss_duplicate",
          patientId: "EIRA-MX-005",
          otherId: "EIRA-MX-006",
        }),
      );
      assert.equal(
        get("decisions", "distinct-pair").action,
        "dismiss_duplicate",
      );
      assert.throws(() =>
        apply(
          admin,
          operation(
            "decisions",
            "distinct-pair",
            { action: "merge_patients" },
            1,
          ),
        ),
      );
      assert.throws(
        () => db.prepare("UPDATE audit_logs SET accion=?").run("alterar"),
        /append-only/,
      );
      assert.throws(
        () => db.prepare("DELETE FROM audit_logs").run(),
        /append-only/,
      );
    },
  );
});
