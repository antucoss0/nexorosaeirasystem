// Cuts the network for real (no "Offline simulado" switch): reloads the app
// from the service worker, captures a patient and syncs when the network returns.
// Needs a production server on localhost so the service worker registers.
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
const baseURL = process.env.BASE_URL || "http://localhost:3000";
const name = "Prueba Sinred " + Date.now();
const browser = await chromium.launch({ args: ["--no-sandbox"] });
try {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 390, height: 844 },
  });
  const login = await context.request.post("/api/auth/login", {
    data: { email: "brigadista@eira.mx", password: "eira2026" },
  });
  assert.equal(login.status(), 200);
  const page = await context.newPage();
  await page.addInitScript(() => sessionStorage.setItem("nexo-intro", "1"));
  await page.goto("/campo");
  await expect(page.locator(".pending")).toHaveText("0 operaciones pendientes");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise((r) =>
        navigator.serviceWorker.addEventListener("controllerchange", r, {
          once: true,
        }),
      );
  });
  await page.reload();
  await page.waitForTimeout(1500);

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator(".connectivity strong")).toHaveText("Offline");
  await expect(page.getByLabel("Jornada activa")).not.toHaveValue("");
  console.log("RED CORTADA /campo recarga desde service worker con datos locales");

  await page.getByLabel("Fecha de nacimiento", { exact: true }).fill("1988-03-09");
  await page.getByLabel("Municipio", { exact: true }).fill("Tuxpan");
  await page.getByLabel("Tipo de servicio / insumo").fill("Orientación sin red");
  await page.getByLabel("Programa").fill("Prevención");
  await page.getByLabel("Nombre completo").fill(name);
  const other = page.getByRole("button", { name: /Es otra persona/ });
  await page.waitForTimeout(1200);
  if (!(await other.isVisible())) {
    await page.locator(".form-actions button.primary").click();
    await page.waitForTimeout(1200);
  }
  if (await other.isVisible()) await other.click();
  await expect(page.locator(".pending")).toHaveText(/[23] operaciones pendientes/);
  const queued = await page.locator(".pending").innerText();
  await page.reload();
  await expect(page.locator(".pending")).toHaveText(queued);
  console.log("CAPTURA SIN RED", queued, "· sobreviven a recargar");

  await context.setOffline(false);
  await expect(page.locator(".pending")).toHaveText("0 operaciones pendientes", {
    timeout: 30000,
  });
  const pull = await (await context.request.get("/api/sync/pull")).json();
  const saved = pull.patients.find((p) => p.nombre_completo === name);
  assert.ok(saved, "paciente no llegó al servidor");
  assert.match(saved.id, /^EIRA-MX-\d+$/);
  console.log("RED RESTAURADA sincronización automática ·", saved.id);

  // Paso 3 del guion: nombre mal escrito de una paciente existente.
  await page.getByLabel("Nombre completo").fill("Maria Guadalupe Lopes");
  await expect(page.locator(".match-notice")).toContainText("coincidencia");
  console.log("COINCIDENCIA", (await page.locator(".match-notice p").innerText()).trim());
  console.log("PASS OFFLINE REAL");
} catch (e) { const pg = browser.contexts()[0]?.pages()[0]; await pg?.screenshot({ path: "/tmp/offline-fail.png" }); throw e; } finally {
  await browser.close();
}
