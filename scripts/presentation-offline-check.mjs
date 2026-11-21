// Verifies the public pages open with the network cut after a single online visit.
import { chromium } from "playwright";
const base = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(base + "/");
await page.evaluate(async () => {
  await navigator.serviceWorker.ready;
  for (let i = 0; i < 100; i++) {
    const cache = await caches.open((await caches.keys())[0] || "x");
    if (await cache.match("/presentacion")) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("precache no terminó");
});
await context.setOffline(true);
for (const [path, text] of [["/presentacion", "Iniciar presentación"], ["/", "fortalecemos comunidades"], ["/login", "eira"], ["/guia", "Nexo"]]) {
  await page.goto(base + path);
  await page.getByText(text, { exact: false }).first().waitFor({ timeout: 8000 });
  console.log("SIN RED", path, "abre");
}
await page.goto(base + "/presentacion");
await page.keyboard.press("Space");
await page.keyboard.press("ArrowRight");
await page.locator('.pz-slide.on [aria-label*="pedazos"]').waitFor({ state: "attached", timeout: 8000 });
const styled = await page.evaluate(() => getComputedStyle(document.querySelector(".pz")).position);
if (styled !== "fixed") throw new Error("estilos no cargaron sin red");
if (errors.length) throw new Error(errors.join("\n"));
console.log("PASS PRESENTACIÓN SIN RED");
await browser.close();
