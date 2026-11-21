import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
const baseURL = process.env.BASE_URL || "http://localhost:3000";
const runId = "EVIDENCIA-" + Date.now();
const evidence =
  process.env.EVIDENCE_DIR || join(homedir(), "screenshots", "nexo-phase2");
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox"],
});
const errors = [];
const watch = (page) => page.on("pageerror", (e) => errors.push(e.message));
async function login(context, role) {
  const response = await context.request.post("/api/auth/login", {
    data: { email: `${role}@eira.mx`, password: "eira2026" },
  });
  assert.equal(response.status(), 200);
}
const op = (table, entityId, patch, baseVersion = 0) => ({
  table,
  entityId,
  patch,
  baseVersion,
  type: baseVersion ? "update" : "create",
  opId: randomUUID(),
  createdAt: new Date().toISOString(),
});
async function push(context, ops, status = 200) {
  const response = await context.request.post("/api/sync/push", {
    data: { ops },
  });
  assert.equal(response.status(), status, await response.text());
  return response.json();
}
async function screenshot(page, name) {
  const path = join(evidence, name);
  await page.screenshot({ path, fullPage: true });
  console.log("SCREENSHOT", path);
}
try {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 430, height: 1120 },
  });
  await login(context, "brigadista");
  const page = await context.newPage();
  watch(page);
  const initial = await (await context.request.get("/api/sync/pull")).json();
  const seed = initial.patients.find((p) => p.id === "EIRA-MX-001");
  assert.ok(seed);
  await page.goto("/campo");
  await expect(page.getByLabel("Jornada activa")).toHaveValue("JOR-001");
  await expect(page.locator(".pending")).toHaveText("0 operaciones pendientes");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise((resolve) =>
        navigator.serviceWorker.addEventListener("controllerchange", resolve, {
          once: true,
        }),
      );
  });
  const offline = page.getByRole("checkbox", { name: "Offline simulado" });
  await offline.check();
  await expect(page.locator(".connectivity strong")).toHaveText(
    "Offline simulado",
  );
  let apiCalls = 0;
  const request = (req) => {
    if (new URL(req.url()).pathname.startsWith("/api/")) apiCalls++;
  };
  page.on("request", request);
  await page
    .getByLabel("Fecha de nacimiento", { exact: true })
    .fill(seed.fecha_nacimiento);
  await page.getByLabel("Teléfono", { exact: true }).fill(seed.telefono);
  await page.getByLabel("Municipio", { exact: true }).fill(seed.municipio);
  await page
    .getByLabel("Tipo de servicio / insumo")
    .fill("Orientación — segunda visita Playwright");
  await page.getByLabel("Nombre completo").fill("Maria Guadalupe Lopez");
  const modal = page.getByRole("dialog", { name: "¿Es la misma paciente?" });
  await expect(modal).toBeVisible();
  const candidate = modal.getByLabel("Candidata a comparar");
  if (await candidate.count()) await candidate.selectOption(seed.id);
  await expect(modal.locator(".comparison-grid")).toContainText(
    "Expediente existente",
  );
  await expect(modal).toContainText("misma fecha de nacimiento");
  console.log(
    "OFFLINE_MODAL Maria Guadalupe Lopez → " +
      seed.id +
      " · comparación lado a lado y razones visibles",
  );
  await screenshot(page, "01-campo-modal.png");
  await modal
    .getByRole("button", {
      name: "Confirmar misma paciente (Agregar visita al historial)",
      exact: true,
    })
    .click();
  await expect(modal).toBeHidden();
  const visits = page.getByTestId("visit-count");
  await expect(visits).toContainText("visitas");
  const history = await visits.innerText();
  assert.ok(parseInt(history, 10) >= 2, history);
  await expect(page.locator(".history-panel")).toContainText(
    "Orientación — segunda visita Playwright",
  );
  await expect(page.locator(".pending")).toHaveText("2 operaciones pendientes");
  assert.equal(apiCalls, 0);
  console.log(
    "OFFLINE_LINK " +
      history +
      " · 2 operaciones locales (atención + decisión) · 0 llamadas API",
  );
  page.off("request", request);
  await offline.uncheck();
  await expect(page.locator(".connectivity strong")).toHaveText("Online");
  await expect(page.locator(".pending")).toHaveText(
    "0 operaciones pendientes",
    { timeout: 20000 },
  );
  const after = await (await context.request.get("/api/sync/pull")).json();
  assert.equal(after.patients.length, initial.patients.length);
  assert.equal(
    after.attentions.filter((a) => a.paciente_uuid === seed.id).length,
    initial.attentions.filter((a) => a.paciente_uuid === seed.id).length + 1,
  );
  console.log(
    "ONLINE_SYNC 0 operaciones pendientes · mismo UUID · sin crear paciente adicional",
  );
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto(`/admin/pacientes/${seed.id}`);
  await expect(
    page.getByRole("heading", { name: seed.nombre_completo, exact: true }),
  ).toBeVisible();
  await expect(page.locator(".history-panel")).toContainText(
    "Orientación — segunda visita Playwright",
  );
  await screenshot(page, "02-ficha-historial.png");
  await page
    .getByRole("button", { name: "Actualizar contacto", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: "Actualizar teléfono", exact: true })
    .check();
  await page
    .getByLabel("Teléfono", { exact: true })
    .fill("341" + Date.now().toString().slice(-7));
  await page
    .getByRole("button", { name: "Guardar campos seleccionados" })
    .click();
  const contactPush = page.waitForRequest(
    (req) => new URL(req.url()).pathname === "/api/sync/push",
  );
  await page.getByRole("button", { name: "Sincronizar ahora" }).click();
  const contactRequest = await contactPush;
  await expect(
    page.getByRole("button", { name: "Sincronizar ahora" }),
  ).toBeEnabled();
  const contactOp = contactRequest
    .postDataJSON()
    .ops.find((o) => o.table === "patients");
  assert.deepEqual(Object.keys(contactOp.patch), ["telefono"]);
  await expect(page.locator(".pending")).toHaveText("0 operaciones pendientes");
  console.log("SELECTIVE_CONTACT solo telefono enviado como parche");
  await page
    .getByRole("link", { name: "Revisión Mamaria →", exact: true })
    .click();
  await expect(page.getByLabel("2. Nombre", { exact: true })).toHaveValue(
    seed.nombre_completo,
  );
  await expect(page.getByLabel("22. BIRADS", { exact: true })).toBeDisabled();
  await expect(page.getByLabel("20. Resultados al ultrasonido")).toHaveValue(
    "Ultrasonido mamario realizado con ultrasonido 5 de CHISON con transductor de 10MHZ.",
  );
  await page.getByLabel("Folio EIRA").fill(runId);
  await page
    .getByLabel("10. Motivo de consulta", { exact: true })
    .fill("Control preventivo. Registro sintético de verificación.");
  await page.getByRole("button", { name: "Guardar formulario" }).click();
  await expect(page.getByRole("status")).toContainText("Formulario guardado");
  await page.getByRole("button", { name: "Sincronizar ahora" }).click();
  await expect(
    page.getByRole("button", { name: "Sincronizar ahora" }),
  ).toBeEnabled();
  await expect(page.locator(".pending")).toHaveText(
    "0 operaciones pendientes",
    { timeout: 20000 },
  );
  await screenshot(page, "03-revision-mamaria.png");
  await page.emulateMedia({ media: "print" });
  assert.equal(await page.locator(".connectivity").isVisible(), false);
  assert.equal(await page.locator(".clinical-footer").isVisible(), true);
  await page.pdf({
    path: join(evidence, "revision-mamaria.pdf"),
    format: "A4",
    printBackground: true,
  });
  await page.emulateMedia({ media: "screen" });
  console.log(
    "MAMARIA estudio guardado · BIRADS bloqueado para brigadista · impresión con pie EIRA",
  );
  const studies = await (await context.request.get("/api/sync/pull")).json();
  const study = studies.attentions.find((a) => a.form_data?.folio === runId);
  assert.ok(study);
  await push(
    context,
    [
      op(
        "attentions",
        study.id,
        { form_data: { f22: "1. Mama normal" } },
        study.version,
      ),
    ],
    403,
  );
  await page.goto(`/admin/pacientes/${seed.id}/estudio/nuevo?tipo=cervix`);
  await expect(page.getByLabel("1. Nombre", { exact: true })).toHaveValue(
    seed.nombre_completo,
  );
  await expect(
    page.getByLabel("27. A. Categoría del diagnóstico citológico (BETHESDA)", {
      exact: true,
    }),
  ).toBeDisabled();
  const gyn = page.getByLabel("12. Situación ginecoobstétrica");
  await gyn.selectOption(["DIU", "Usos hormonales"]);
  await page.getByRole("button", { name: "Guardar formulario" }).click();
  await expect(page.getByRole("status")).toContainText("Formulario guardado");
  await page.getByRole("button", { name: "Sincronizar ahora" }).click();
  await expect(page.locator(".pending")).toHaveText(
    "0 operaciones pendientes",
    { timeout: 20000 },
  );
  await expect(
    page.getByRole("button", { name: "Sincronizar ahora" }),
  ).toBeEnabled();
  console.log("CERVIX captura multiselección guardada · diagnóstico bloqueado");
  const clinical = await browser.newContext({ baseURL });
  await login(clinical, "medico");
  await push(clinical, [
    op(
      "attentions",
      study.id,
      { form_data: { f22: "1. Mama normal" } },
      study.version,
    ),
  ]);
  console.log("CLINICAL_RBAC brigadista=403 · médico=200 en BIRADS");
  await clinical.close();
  const adminContext = await browser.newContext({
    baseURL,
    viewport: { width: 1440, height: 1050 },
  });
  await login(adminContext, "admin");
  const adminPage = await adminContext.newPage();
  watch(adminPage);
  const current = await (
    await adminContext.request.get("/api/sync/pull")
  ).json();
  const target = current.patients.find((p) => p.id === "EIRA-MX-004");
  await push(context, [
    op("patients", target.id, { telefono: "3415550001" }, target.version),
  ]);
  await push(context, [
    op(
      "patients",
      target.id,
      { telefono: "3415550002", contacto_alterno: "Contacto local sintético" },
      target.version,
    ),
  ]);
  await adminPage.goto("/admin/conflictos");
  await expect(
    adminPage.locator(".conflict-card").filter({ hasText: target.id }),
  ).toBeVisible();
  await expect(adminPage.locator(".duplicate-pair").first()).toBeVisible();
  await screenshot(adminPage, "04-conflictos.png");
  const conflict = adminPage
    .locator(".conflict-card")
    .filter({ hasText: target.id });
  const selectors = conflict.locator("select");
  for (let i = 0; i < (await selectors.count()); i++)
    await selectors.nth(i).selectOption(i === 0 ? "client" : "server");
  await conflict
    .getByRole("button", { name: "Confirmar resolución y auditar" })
    .click();
  await expect(conflict).toBeHidden({ timeout: 15000 });
  console.log("CONFLICT resolución campo a campo sincronizada y auditada");
  const pairsBefore = await (
    await adminContext.request.get("/api/admin/conflicts")
  ).json();
  const pair = adminPage.locator(".duplicate-pair").first();
  await pair.getByRole("button", { name: "Son personas distintas" }).click();
  await expect
    .poll(
      async () =>
        (await (await adminContext.request.get("/api/admin/conflicts")).json())
          .pairs.length,
    )
    .toBe(pairsBefore.pairs.length - 1);
  console.log("DUPLICATE Son personas distintas recordado por servidor");
  await adminPage.goto("/admin/bitacora");
  await adminPage.getByLabel("Filtrar Acción").fill("same_patient");
  await expect(adminPage.locator("tbody tr").first()).toContainText(
    "same_patient",
  );
  const csv = await adminContext.request.get(
    "/api/admin/audit?accion=same_patient&format=csv",
  );
  assert.equal(csv.status(), 200);
  assert.ok((await csv.text()).includes("same_patient"));
  assert.equal((await context.request.get("/api/admin/audit")).status(), 403);
  assert.equal(
    (await context.request.get("/api/admin/conflicts")).status(),
    403,
  );
  console.log(
    "AUDIT filtro acción + exportación CSV · endpoints admin protegidos (403 brigadista)",
  );
  await adminPage.goto("/admin");
  await expect(
    adminPage.getByRole("heading", { name: "Conectar para cuidar mejor." }),
  ).toBeVisible();
  await expect(adminPage.locator(".stat-card")).toHaveCount(4);
  console.log("DASHBOARD 4 KPIs visibles");
  assert.deepEqual(errors, []);
  console.log("PASS PHASE 2 · 0 errores de navegador");
  await adminContext.close();
  await context.close();
} finally {
  await browser.close();
}
