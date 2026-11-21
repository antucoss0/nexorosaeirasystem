// A forgotten "offline simulado" switch must not lock anyone out of the site.
import { chromium } from "playwright";
const base = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
await page.goto(base + "/login");
await page.evaluate(async () => {
  await navigator.serviceWorker.ready;
  while (!navigator.serviceWorker.controller) await new Promise((r) => setTimeout(r, 100));
  localStorage.setItem("eira-offline", "true");
  await new Promise((done) => {
    const c = new MessageChannel();
    c.port1.onmessage = done;
    navigator.serviceWorker.controller.postMessage({ type: "OFFLINE", value: true }, [c.port2]);
  });
});
await page.goto(base + "/campo");
await page.getByText("Restablecer conexión y reintentar").click();
await page.waitForURL(/\/login/);
console.log("PANTALLA SIN CONEXIÓN botón restablece y vuelve al login");
await page.evaluate(() => localStorage.setItem("eira-offline", "true"));
await page.goto(base + "/login");
await page.fill('input[type="email"]', "brigadista@eira.mx");
await page.fill('input[type="password"]', "eira2026");
await page.locator('button.primary.full').click();
await page.waitForURL(/\/campo/, { timeout: 15000 });
console.log("LOGIN entra aunque el interruptor quedó encendido");
console.log("PASS SIN BLOQUEO");
await browser.close();
