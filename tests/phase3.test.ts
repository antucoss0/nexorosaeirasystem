import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { User } from "../lib/rbac";
process.env.DATA_DIR = mkdtempSync(join(process.cwd(), "data-test-"));
const admin: User = {
  id: "admin",
  role: "admin",
  email: "admin@eira.mx",
  nombre: "Admin",
  municipio: null,
};
const municipio: User = {
  ...admin,
  id: "municipio",
  role: "municipio",
  municipio: "Zapotlán el Grande",
};
const lab: User = { ...admin, id: "laboratorio", role: "laboratorio" };
const medico: User = { ...admin, id: "medico", role: "consulta_clinica" };
const captura: User = { ...admin, id: "brigadista", role: "captura" };
test("fase 3: jornadas, cartas y documentos seguros", async (t) => {
  const service = await import("../lib/phase3");
  const { db, decode } = await import("../lib/db");
  const { applyOperations } = await import("../lib/sync");
  t.after(() => {
    db.close();
    rmSync(process.env.DATA_DIR!, { recursive: true, force: true });
  });
  const {
    saveJornada,
    listJornadas,
    traffic,
    generateLetter,
    verifiedLetter,
    clauses,
    clausesHash,
    transitionRequirement,
    remind,
    listNotifications,
    associatePAP,
    papAction,
    portalAvailable,
    verifyPortal,
    validatePortalSession,
    markConsulted,
    assertNeutral,
    hash,
    authorizedFile,
    ensurePapSeed,
    record,
  } = service;
  const forbidden = (fn: () => unknown) =>
    assert.throws(fn, (e: any) => e.status === 403);
  const create = (municipality = "Zapotlán el Grande") =>
    saveJornada(admin, {
      municipio: municipality,
      sede: "Sede sintética",
      fecha: "2027-06-15",
      servicios: ["Revisión mamaria", "Citología cervical"],
      responsables: [
        { nombre: "Coordinadora demo", rol: "Enlace", contacto: "3410000000" },
      ],
      persona_enlace: {
        nombre: "Enlace demo",
        contacto: "enlace@example.test",
      },
    });
  const file = (
    purpose = "pap",
    jornada: string | null = null,
    key: string | null = null,
  ) => {
    const id = randomUUID();
    db.prepare("INSERT INTO files VALUES (?,?,?,?,?,?,?,?)").run(
      id,
      "demo.pdf",
      "unused-test-path",
      "application/pdf",
      100,
      1,
      new Date().toISOString(),
      purpose === "pap" ? lab.id : municipio.id,
    );
    db.prepare("INSERT INTO file_links VALUES (?,?,?,?,?,?)").run(
      id,
      purpose,
      jornada,
      key,
      null,
      purpose === "pap" ? lab.id : municipio.id,
    );
    return id;
  };
  let j: any;
  await t.test(
    "admin configura requisitos y municipio solo consulta su ámbito",
    () => {
      j = create();
      assert.equal(j.requisitos.length, 4);
      const other = create("Tuxpan");
      forbidden(() => saveJornada(municipio, { ...j }));
      assert.ok(
        listJornadas(municipio).every(
          (x) => x.municipio === municipio.municipio,
        ),
      );
      assert.ok(!listJornadas(municipio).some((x) => x.id === other.id));
      forbidden(() => service.scopedJornada(municipio, other.id));
      assert.throws(() => create(""));
      assert.equal(traffic({ ...j, requisitos: [] }).color, "verde");
      assert.equal(traffic(j, Date.parse("2027-01-01")).color, "amarillo");
      assert.equal(traffic(j, Date.parse("2027-06-15")).color, "rojo");
      assert.equal(
        traffic(j, Date.parse("2027-06-08T12:00:00Z")).color,
        "rojo",
      );
      assert.equal(
        traffic(j, Date.parse("2027-06-07T12:00:00Z")).color,
        "amarillo",
      );
    },
  );
  await t.test(
    "cartas rechazan manipular cláusulas y conservan versiones inmutables con hash/diff",
    () => {
      const variables = {
        municipio: j.municipio,
        presidente: "Presidenta Demo",
        enlace: "Enlace Demo",
        sede: j.sede,
        fecha: j.fecha,
        servicios: j.servicios,
        beneficiarias: 50,
      };
      assert.throws(
        () =>
          generateLetter(admin, {
            jornadaId: j.id,
            variables,
            clauses: ["Cláusula alterada"],
          }),
        /protegidas/,
      );
      assert.throws(
        () =>
          generateLetter(admin, {
            jornadaId: j.id,
            variables: { ...variables, clauses: ["alterada"] },
          }),
        /variables/,
      );
      forbidden(() =>
        generateLetter(municipio, { jornadaId: j.id, variables }),
      );
      const v1 = generateLetter(admin, { jornadaId: j.id, variables });
      const v2 = generateLetter(admin, {
        jornadaId: j.id,
        variables: { ...variables, beneficiarias: 75 },
      });
      assert.equal(v1.version, 1);
      assert.equal(v2.version, 2);
      assert.deepEqual(Object.keys(v2.diff), ["beneficiarias"]);
      assert.equal(v1.clauses_hash, clausesHash);
      assert.deepEqual(verifiedLetter(municipio, j.id, 1).clauses, clauses);
      assert.throws(
        () => db.prepare("UPDATE letters SET clauses=?").run("alteradas"),
        /immutable/,
      );
      assert.throws(() => db.prepare("DELETE FROM letters").run(), /immutable/);
    },
  );
  await t.test(
    "archivo municipal, observación, nueva entrega, aprobación e historial auditado",
    () => {
      for (const requirement of j.requisitos) {
        const f = file("jornada", j.id, requirement.clave);
        transitionRequirement(
          municipio,
          j.id,
          requirement.clave,
          "recibido",
          "",
          f,
        );
        forbidden(() =>
          transitionRequirement(municipio, j.id, requirement.clave, "aprobado"),
        );
        assert.throws(() =>
          transitionRequirement(
            admin,
            j.id,
            requirement.clave,
            "observado",
            "",
          ),
        );
        transitionRequirement(
          admin,
          j.id,
          requirement.clave,
          "observado",
          "Adjunta el documento completo",
        );
        assert.equal(
          traffic(record("jornadas", j.id), Date.parse("2027-01-01")).color,
          "rojo",
        );
        transitionRequirement(
          municipio,
          j.id,
          requirement.clave,
          "recibido",
          "",
          file("jornada", j.id, requirement.clave),
        );
        transitionRequirement(admin, j.id, requirement.clave, "aprobado");
        assert.equal(
          record("jornadas", j.id).requisitos.find(
            (r: any) => r.clave === requirement.clave,
          ).historial.length,
          4,
        );
        assert.throws(() =>
          transitionRequirement(
            municipio,
            j.id,
            requirement.clave,
            "recibido",
            "",
            f,
          ),
        );
      }
      assert.equal(traffic(record("jornadas", j.id)).color, "verde");
    },
  );
  await t.test(
    "recordatorio amable limitado a 24h y únicamente visible al municipio correspondiente",
    () => {
      const target = create();
      const key = target.requisitos[0].clave;
      const now = Date.now();
      remind(admin, target.id, key, now);
      assert.throws(
        () => remind(admin, target.id, key, now + 1000),
        (e: any) => e.status === 429,
      );
      remind(admin, target.id, key, now + 86400001);
      assert.ok(listNotifications(municipio).length >= 2);
      assert.equal(
        listNotifications({ ...municipio, municipio: "Otro" }).length,
        0,
      );
      forbidden(() => remind(municipio, target.id, key));
    },
  );
  await t.test(
    "guardia neutral rechaza lenguaje clínico, acentos y variantes; acepta texto neutral",
    () => {
      assert.doesNotThrow(() =>
        assertNeutral(
          "Hola, EIRA tiene un documento disponible. Verifica tu identidad.",
        ),
      );
      for (const word of [
        "papanicolaou",
        "citología",
        "resultado positivo",
        "resultado negativo",
        "VPH",
        "V.P.H.",
        "cáncer",
        "diagnóstico",
        "BIRADS",
        "lesión",
        "tumor",
        "biopsia",
        "CÁN\u200bCER",
      ])
        assert.throws(() => assertNeutral("Hola " + word));
      assert.doesNotThrow(() =>
        service.neutralMessage(
          "http://localhost/resultado/abcVPHabc",
          "2027-01-01",
        ),
      );
    },
  );
  let a: any;
  await t.test(
    "asociación exige dos atributos, PDF propio y revisión previa a autorización",
    () => {
      const p = record("patients", "EIRA-MX-001"),
        id = file();
      const checks = [
        { attribute: "nombre_completo", value: p.nombre_completo },
        { attribute: "fecha_nacimiento", value: p.fecha_nacimiento },
      ];
      assert.throws(() =>
        associatePAP(lab, { patientId: p.id, fileId: id, checks: [] }),
      );
      assert.throws(() =>
        associatePAP(lab, {
          patientId: p.id,
          fileId: id,
          checks: [checks[0], checks[0]],
        }),
      );
      assert.throws(() =>
        associatePAP(lab, {
          patientId: p.id,
          fileId: id,
          checks: [checks[0], { ...checks[1], value: "1900-01-01" }],
        }),
      );
      forbidden(() =>
        associatePAP(admin, { patientId: p.id, fileId: id, checks }),
      );
      a = associatePAP(lab, { patientId: p.id, fileId: id, checks });
      assert.equal(a.estado_pap, "Cargado");
      assert.throws(() =>
        papAction(
          medico,
          { id: a.id, action: "authorize" },
          "http://localhost",
        ),
      );
      forbidden(() =>
        papAction(lab, { id: a.id, action: "authorize" }, "http://localhost"),
      );
      forbidden(() =>
        papAction(
          admin,
          { id: a.id, action: "notify", channel: "sms" },
          "http://localhost",
        ),
      );
      assert.throws(() =>
        papAction(
          admin,
          { id: a.id, action: "review", identity: true, legible: false },
          "http://localhost",
        ),
      );
      papAction(
        admin,
        { id: a.id, action: "review", identity: true, legible: true },
        "http://localhost",
      );
      papAction(medico, { id: a.id, action: "authorize" }, "http://localhost");
      assert.equal(record("attentions", a.id).estado_pap, "Autorizado Clínico");
      forbidden(() => authorizedFile(municipio, id));
      forbidden(() => authorizedFile(captura, id));
      assert.equal(authorizedFile(medico, id).id, id);
    },
  );
  const origin = "http://localhost";
  let issued: any, raw: string;
  await t.test(
    "notificación solo guarda hashes, tiene vigencia y rechaza texto clínico",
    () => {
      assert.throws(() =>
        papAction(
          admin,
          {
            id: a.id,
            action: "notify",
            channel: "sms",
            message: "Citología positiva",
          },
          origin,
        ),
      );
      issued = papAction(
        admin,
        { id: a.id, action: "notify", channel: "sms", hours: 1 },
        origin,
      );
      raw = issued.link.split("/").at(-1)!;
      assert.ok(portalAvailable(raw));
      assert.equal(record("attentions", a.id).token_hash, hash(raw));
      const notification = db
        .prepare("SELECT * FROM notifications WHERE attention_id=?")
        .get(a.id) as any;
      assert.ok(!notification.message.includes(raw));
      assert.ok(!JSON.stringify(record("attentions", a.id)).includes(raw));
      assert.ok(!portalAvailable(raw, Date.now() + 3600001));
      assert.equal(
        verifyPortal(
          raw,
          "fecha_nacimiento",
          "1980-03-12",
          Date.now() + 3600001,
        ).ok,
        false,
      );
      assert.throws(() => validatePortalSession(undefined, a.id));
    },
  );
  await t.test(
    "cinco intentos fallidos bloquean de forma persistente y auditan el bloqueo",
    () => {
      for (let i = 1; i <= 5; i++) {
        const result = verifyPortal(raw, "fecha_nacimiento", "1900-01-01");
        assert.equal(result.ok, false);
        assert.equal(result.status, i === 5 ? 429 : 400);
      }
      assert.equal(portalAvailable(raw), false);
      assert.equal(
        verifyPortal(
          raw,
          "fecha_nacimiento",
          record("patients", a.paciente_uuid).fecha_nacimiento,
        ).ok,
        false,
      );
      assert.equal(
        (
          db
            .prepare(
              "SELECT count(*) n FROM audit_logs WHERE accion='bloqueo_identidad'",
            )
            .get() as any
        ).n,
        1,
      );
    },
  );
  await t.test(
    "regenerar permite verificación; sesión por documento expira y revocar invalida sesión/enlace",
    () => {
      issued = papAction(
        admin,
        { id: a.id, action: "regenerate", channel: "sms" },
        origin,
      );
      const fresh = issued.link.split("/").at(-1)!;
      assert.ok(!portalAvailable(raw));
      const p = record("patients", a.paciente_uuid);
      const v = verifyPortal(fresh, "telefono", p.telefono.slice(-4));
      assert.ok(v.ok);
      if (!v.ok) throw Error("falló verificación");
      validatePortalSession(v.session, a.id);
      assert.throws(() => validatePortalSession(v.session, "otro"));
      assert.throws(() =>
        validatePortalSession(v.session, a.id, Date.now() + 600001),
      );
      markConsulted(v.session, a.id);
      assert.equal(record("attentions", a.id).estado_pap, "Consultado");
      assert.ok(record("attentions", a.id).leido_en);
      papAction(admin, { id: a.id, action: "revoke" }, origin);
      assert.ok(!portalAvailable(fresh));
      assert.throws(() => validatePortalSession(v.session, a.id));
    },
  );
  await t.test(
    "rechazo vuelve a laboratorio con nota y admite una nueva asociación verificada",
    () => {
      const p = record("patients", "EIRA-MX-002"),
        checks = [
          { attribute: "nombre_completo", value: p.nombre_completo },
          { attribute: "fecha_nacimiento", value: p.fecha_nacimiento },
        ];
      const created = associatePAP(lab, {
        patientId: p.id,
        fileId: file(),
        checks,
      });
      assert.throws(() =>
        papAction(
          admin,
          { id: created.id, action: "reject", note: "" },
          origin,
        ),
      );
      papAction(
        admin,
        { id: created.id, action: "reject", note: "Documento ilegible" },
        origin,
      );
      const replacement = associatePAP(lab, {
        id: created.id,
        patientId: p.id,
        fileId: file(),
        checks,
      });
      assert.equal(replacement.estado_pap, "Cargado");
      assert.equal(replacement.id, created.id);
    },
  );
  await t.test(
    "seed incluye no leído >48h y paciente sin teléfono; entrega asistida requiere firma",
    async () => {
      await ensurePapSeed();
      await ensurePapSeed();
      const panel = service.listPAP(admin);
      assert.ok(panel.some((r) => r.unread));
      const withoutPhone = panel.find((r) => !r.patient.telefono)!;
      assert.ok(withoutPhone);
      assert.throws(() =>
        papAction(
          admin,
          {
            id: withoutPhone.id,
            action: "assist",
            promotora: "Demo",
            method: "impresión en sede",
            date: new Date().toISOString().slice(0, 10),
            signed: false,
          },
          origin,
        ),
      );
      const done = papAction(
        admin,
        {
          id: withoutPhone.id,
          action: "assist",
          promotora: "Promotora Demo",
          method: "impresión en sede",
          date: new Date().toISOString().slice(0, 10),
          signed: true,
        },
        origin,
      );
      assert.equal(done.estado_pap, "Entrega Asistida");
      assert.equal(done.entrega_asistida.firma_recibido, true);
    },
  );
  await t.test(
    "sync genérico no evita controles de PAP ni altera cartas o requisitos",
    () => {
      const op = (
        table: any,
        entityId: string,
        patch: any,
        version: number,
      ) => ({
        opId: randomUUID(),
        table,
        entityId,
        type: "update" as const,
        patch,
        baseVersion: version,
        createdAt: new Date().toISOString(),
      });
      forbidden(() =>
        applyOperations(admin, [
          op(
            "attentions",
            a.id,
            { estado_pap: "pendiente" },
            record("attentions", a.id).version,
          ),
        ]),
      );
      forbidden(() =>
        applyOperations(admin, [
          op(
            "jornadas",
            j.id,
            { versiones_carta: [] },
            record("jornadas", j.id).version,
          ),
        ]),
      );
      forbidden(() =>
        applyOperations(municipio, [
          op(
            "jornadas",
            j.id,
            { requisitos: [] },
            record("jornadas", j.id).version,
          ),
        ]),
      );
    },
  );
  await t.test("PDF institucional descargable es un PDF válido", async () => {
    const { PDFDocument } = await import("pdf-lib");
    const bytes = await service.documentPDF("CARTA COMPROMISO", clauses);
    assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
    const parsed = await PDFDocument.load(bytes);
    assert.ok(parsed.getPageCount() >= 1);
    assert.ok(
      (db.prepare("SELECT count(*) n FROM audit_logs").get() as any).n > 10,
    );
  });
});
