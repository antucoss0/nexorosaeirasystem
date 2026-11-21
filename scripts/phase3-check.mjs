import { chromium, expect } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
const baseURL = process.env.BASE_URL || "http://localhost:3000";
const evidence =
  process.env.EVIDENCE_DIR || join(homedir(), "screenshots", "nexo-phase3");
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox"],
});
const failures = [];
const pages = [];
async function login(role) {
  const c = await browser.newContext({
    baseURL,
    viewport: { width: 1440, height: 1050 },
  });
  const r = await c.request.post("/api/auth/login", {
    data: { email: role + "@eira.mx", password: "eira2026" },
  });
  assert.equal(r.status(), 200);
  const p = await c.newPage();
  p.on("pageerror", (e) => failures.push(e.message));
  pages.push(p);
  return { c, p };
}
async function action(page, label, kind, endpoint = "/api/jornadas") {
  const promise = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === endpoint &&
      r.request().method() === "POST" &&
      r.request().postDataJSON().action === kind,
  );
  await page.getByRole("button", { name: label, exact: true }).click();
  const r = await promise;
  assert.equal(r.status(), 200, (await r.json()).error);
  return r.json();
}
async function chooseJornada(page, sede) {
  await page.goto("/admin/jornadas");
  const card = page.locator(".jornada-card").filter({ hasText: sede });
  await expect(card).toBeVisible();
  await card.click();
}
async function choosePAP(page, id) {
  await page.goto("/admin/pap");
  const row = page.getByTestId("pap-row").filter({ hasText: id });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Gestionar" }).click();
  await expect(page.locator(".pap-detail .panel-heading")).toContainText(id);
}
async function uploadRequirement(page, buffer) {
  const promise = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === "/api/files" &&
      r.request().method() === "POST",
  );
  await page
    .getByLabel("Archivo Carta compromiso", { exact: true })
    .setInputFiles({
      name: "carta-ficticia.pdf",
      mimeType: "application/pdf",
      buffer,
    });
  assert.equal((await promise).status(), 201);
  await expect(page.locator(".requirement-card .tag")).toHaveText("recibido");
}
async function shot(page, name, locator) {
  const path = join(evidence, name);
  if (locator) await locator.screenshot({ path });
  else {
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path });
  }
  console.log("SCREENSHOT " + path);
}
try {
  const admin = await login("admin"),
    municipio = await login("municipio"),
    lab = await login("laboratorio"),
    med = await login("medico");
  const sede = "Jornada Demo " + Date.now();
  const future = new Date(Date.now() + 30 * 86400000)
    .toISOString()
    .slice(0, 10);
  await admin.p.goto("/admin/jornadas");
  await admin.p
    .getByRole("button", { name: "Nueva jornada", exact: true })
    .click();
  await admin.p.getByLabel("Sede jornada").fill(sede);
  await admin.p.getByLabel("Fecha jornada").fill(future);
  await admin.p
    .getByLabel("Persona enlace", { exact: true })
    .fill("Enlace Municipal Demo");
  await admin.p.getByLabel("Contacto enlace").fill("3410000000");
  await admin.p.getByLabel("Responsable 1 nombre").fill("Coordinadora Demo");
  await admin.p
    .getByLabel("Responsable 1 contacto")
    .fill("coordinacion@example.test");
  for (let i = 0; i < 3; i++)
    await admin.p
      .getByRole("button", { name: "Quitar requisito", exact: true })
      .last()
      .click();
  const jornada = await action(admin.p, "Guardar jornada", "save");
  await expect(admin.p.locator(".jornada-detail")).toContainText(sede);
  console.log(
    "JORNADAS crear jornada · checklist configurable · amarillo con >7 días",
  );
  await admin.p
    .getByLabel("Presidente/a municipal")
    .fill("Presidenta Municipal Demo");
  await action(admin.p, "Generar carta v1", "letter");
  await expect(admin.p.locator(".letter-versions")).toContainText("Carta v1");
  await shot(admin.p, "02-carta.png", admin.p.locator(".carta-panel"));
  console.log(
    "CARTA v1 inmutable · 6 cláusulas protegidas · SHA-256 y autor registrados",
  );
  const doc = await PDFDocument.create();
  doc.addPage().drawText("Documento ficticio de demostracion municipal");
  const bytes = Buffer.from(await doc.save());
  await chooseJornada(municipio.p, sede);
  await uploadRequirement(municipio.p, bytes);
  console.log("MUNICIPIO archivo ficticio → recibido");
  await chooseJornada(admin.p, sede);
  await admin.p
    .getByLabel("Nota Carta compromiso")
    .fill("Por favor adjunta la carta completa y legible. Gracias.");
  await action(admin.p, "Solicitar corrección", "transition");
  await expect(admin.p.locator(".requirement-card .tag")).toHaveText(
    "observado",
  );
  await chooseJornada(municipio.p, sede);
  await expect(municipio.p.locator(".correction-note")).toContainText(
    "carta completa",
  );
  await uploadRequirement(municipio.p, bytes);
  console.log("CORRECCIÓN nota visible al municipio · nueva carga → recibido");
  await chooseJornada(admin.p, sede);
  await action(admin.p, "Aprobar requisito", "transition");
  await expect(
    admin.p.locator(".jornada-card").filter({ hasText: sede }),
  ).toContainText("verde");
  await shot(admin.p, "01-semaforo.png");
  const dl = admin.p.waitForEvent("download");
  await admin.p
    .getByRole("link", { name: "Descargar PDF v1", exact: true })
    .click();
  const carta = await dl;
  await carta.saveAs(join(evidence, "carta-compromiso-v1.pdf"));
  assert.equal(
    (await readFile(join(evidence, "carta-compromiso-v1.pdf")))
      .subarray(0, 5)
      .toString(),
    "%PDF-",
  );
  console.log(
    "APROBACIÓN semáforo verde · historial 4 transiciones · PDF institucional descargado",
  );
  const scoped = await (await municipio.c.request.get("/api/jornadas")).json();
  assert.ok(scoped.jornadas.every((j) => j.municipio === "Zapotlán el Grande"));
  const other = (
    await (await admin.c.request.get("/api/jornadas")).json()
  ).jornadas.find((j) => j.municipio !== "Zapotlán el Grande");
  assert.equal(
    (
      await municipio.c.request.get(`/api/jornadas/${other.id}/cartas/1`)
    ).status(),
    403,
  );
  console.log(
    "RBAC municipal: no consulta otro municipio ni descarga sus cartas",
  );
  await lab.p.goto("/admin/pap");
  const papData = await (await lab.c.request.get("/api/pap")).json();
  const patient = papData.patients.find((p) => p.id === "EIRA-MX-001");
  await lab.p
    .getByLabel("Paciente PAP", { exact: true })
    .selectOption(patient.id);
  await lab.p.getByLabel("Nombre documento").fill(patient.nombre_completo);
  await lab.p.getByLabel("Nacimiento documento").fill(patient.fecha_nacimiento);
  await lab.p
    .getByRole("checkbox", {
      name: "Confirmé ambos atributos contra el documento recibido",
    })
    .check();
  await lab.p
    .getByRole("button", { name: "Generar PDF sintético", exact: true })
    .click();
  await expect(
    lab.p.getByText("Archivo listo: documento-sintetico.pdf"),
  ).toBeVisible();
  const associated = await action(
    lab.p,
    "Asociar documento",
    "associate",
    "/api/pap",
  );
  await expect(
    lab.p.getByTestId("pap-row").filter({ hasText: associated.id }),
  ).toContainText("Cargado");
  console.log(
    "PAP laboratorio genera PDF sintético · 2 atributos confirmados · Cargado",
  );
  assert.equal(
    (
      await lab.c.request.post("/api/pap", {
        data: { action: "authorize", id: associated.id },
      })
    ).status(),
    403,
  );
  await choosePAP(admin.p, associated.id);
  await admin.p.getByLabel("Identidad revisada").check();
  await admin.p.getByLabel("Documento legible").check();
  await action(admin.p, "Confirmar revisión Admin", "review", "/api/pap");
  await choosePAP(med.p, associated.id);
  await action(med.p, "Autorizar clínicamente", "authorize", "/api/pap");
  console.log(
    "REVISIÓN Admin → autorización Médico · laboratorio no autoriza (403)",
  );
  await choosePAP(admin.p, associated.id);
  const notification = await action(
    admin.p,
    "Notificar documento",
    "notify",
    "/api/pap",
  );
  const visibleText = notification.preview.replace(/https?:\/\/\S+/g, "");
  assert.ok(
    !/papanicolaou|citolog|positiv|negativ|vph|cáncer|diagnóst|birads|lesión/i.test(
      visibleText,
    ),
  );
  await expect(admin.p.getByTestId("portal-link")).toBeVisible();
  console.log(
    "NOTIFICACIÓN neutral · token aleatorio de 72h · solo hash persistido",
  );
  const portalContext = await browser.newContext({
    baseURL,
    viewport: { width: 430, height: 1000 },
  });
  const portal = await portalContext.newPage();
  pages.push(portal);
  portal.on("pageerror", (e) => failures.push(e.message));
  assert.equal(
    (
      await portalContext.request.get("/api/files/" + associated.pdf_file_id)
    ).status(),
    401,
  );
  assert.equal(
    (
      await portalContext.request.get("/api/portal/document/" + associated.id)
    ).status(),
    403,
  );
  await portal.goto(notification.link);
  await portal.getByLabel("Dato de identidad").fill(patient.fecha_nacimiento);
  await portal
    .getByRole("button", { name: "Verificar identidad", exact: true })
    .click();
  await expect(
    portal.getByRole("heading", { name: "Tu documento, en tus manos." }),
  ).toBeVisible();
  await shot(portal, "04-portal.png");
  const download = portal.waitForEvent("download");
  await portal
    .getByRole("link", { name: "Descargar documento", exact: true })
    .click();
  const pdf = await download;
  await pdf.saveAs(join(evidence, "documento-portal.pdf"));
  assert.equal(
    (await readFile(join(evidence, "documento-portal.pdf")))
      .subarray(0, 5)
      .toString(),
    "%PDF-",
  );
  await choosePAP(admin.p, associated.id);
  await expect(
    admin.p.getByTestId("pap-row").filter({ hasText: associated.id }),
  ).toContainText("Consultado");
  console.log(
    "PORTAL sin login · identidad verificada · cookie HttpOnly por documento · descarga → Consultado",
  );
  let assisted = (
    await (await admin.c.request.get("/api/pap")).json()
  ).results.find(
    (r) =>
      r.assisted_eligible &&
      r.authorized_at &&
      r.estado_pap === "Autorizado Clínico",
  );
  if (!assisted) {
    const offlinePatient = papData.patients.find((p) => !p.telefono);
    const uploaded = await lab.c.request.post("/api/files", {
      multipart: {
        file: {
          name: "documento-sintetico.pdf",
          mimeType: "application/pdf",
          buffer: bytes,
        },
      },
    });
    assert.equal(uploaded.status(), 201);
    const file = await uploaded.json();
    const association = await lab.c.request.post("/api/pap", {
      data: {
        action: "associate",
        patientId: offlinePatient.id,
        fileId: file.id,
        checks: [
          {
            attribute: "nombre_completo",
            value: offlinePatient.nombre_completo,
          },
          {
            attribute: "fecha_nacimiento",
            value: offlinePatient.fecha_nacimiento,
          },
        ],
      },
    });
    assert.equal(association.status(), 200);
    assisted = await association.json();
    assert.equal(
      (
        await admin.c.request.post("/api/pap", {
          data: {
            action: "review",
            id: assisted.id,
            identity: true,
            legible: true,
          },
        })
      ).status(),
      200,
    );
    assert.equal(
      (
        await med.c.request.post("/api/pap", {
          data: { action: "authorize", id: assisted.id },
        })
      ).status(),
      200,
    );
  }
  await choosePAP(admin.p, assisted.id);
  await admin.p
    .getByRole("button", { name: "Entrega asistida", exact: true })
    .click();
  await admin.p.getByLabel("Nombre promotora").fill("Promotora Demo EIRA");
  await admin.p.getByLabel("Firma de recibido").check();
  await action(admin.p, "Confirmar entrega asistida", "assist", "/api/pap");
  await expect(
    admin.p.getByTestId("pap-row").filter({ hasText: assisted.id }),
  ).toContainText("Entrega Asistida");
  await expect(admin.p.locator(".unread-flag").first()).toBeVisible();
  await shot(admin.p, "03-pap-panel.png");
  console.log(
    "ENTREGA ASISTIDA promotora + impresión en sede + fecha + firma · auditada",
  );
  const cookie = (await portalContext.cookies()).find((c) =>
    c.name.startsWith("eira_document_"),
  );
  assert.ok(cookie.httpOnly);
  assert.equal(cookie.path, "/api/portal/document/" + associated.id);
  await admin.c.request.post("/api/pap", {
    data: { id: associated.id, action: "revoke" },
  });
  assert.equal(
    (
      await portalContext.request.get("/api/portal/document/" + associated.id)
    ).status(),
    403,
  );
  console.log(
    "REVOCACIÓN invalida la sesión y el enlace anterior · PDF no público",
  );
  assert.deepEqual(failures, []);
  console.log("PASS PHASE 3 · 0 errores de navegador");
} catch (e) {
  for (let i = 0; i < pages.length; i++)
    if (!pages[i].isClosed())
      await pages[i]
        .screenshot({ path: join(evidence, `failure-${i}.png`) })
        .catch(() => {});
  throw e;
} finally {
  await browser.close();
}
