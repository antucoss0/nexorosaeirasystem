import { chromium, expect } from "@playwright/test";
import ExcelJS from "exceljs";
import { PDFDocument, PDFRawStream, PDFName } from "pdf-lib";
import { inflateSync } from "node:zlib";
import { mkdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
const baseURL = process.env.BASE_URL || "http://localhost:3000",
  evidence =
    process.env.EVIDENCE_DIR || join(homedir(), "screenshots", "nexo-phase4");
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox"],
});
const c = await browser.newContext({
  baseURL,
  viewport: { width: 1440, height: 1050 },
});
const p = await c.newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
async function run(label, action) {
  const wait = p.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === "/api/impacto" &&
      r.request().method() === "POST" &&
      r.request().headers()["content-type"]?.includes("application/json") &&
      r.request().postDataJSON().action === action,
  );
  await p.getByRole("button", { name: label, exact: true }).click();
  const res = await wait;
  assert.equal(res.status(), 200, (await res.json()).error);
  return res.json();
}
async function screenshot(name, fullPage = true) {
  await p.evaluate(() => scrollTo(0, 0));
  const path = join(evidence, name);
  await p.screenshot({ path, fullPage });
  console.log("SCREENSHOT " + path);
}
try {
  await p.goto("/");
  await expect(
    p.getByRole("heading", { name: /Conectamos salud/ }),
  ).toBeVisible();
  await expect(
    p.getByRole("heading", { name: /Innovación que cuida/ }),
  ).toBeVisible();
  await screenshot("04-landing.png", false);
  await p.goto("/guia");
  await expect(p.locator(".guide-step")).toHaveCount(4);
  await expect(p.locator(".demo-credentials")).toContainText("eira2026");
  await screenshot("05-guia.png", false);
  console.log(
    "LANDING marca y dos lemas · guía con cuatro recorridos, enlaces y credenciales",
  );
  assert.equal(
    (
      await c.request.post("/api/auth/login", {
        data: { email: "admin@eira.mx", password: "eira2026" },
      })
    ).status(),
    200,
  );
  await p.goto("/admin/impacto");
  let adjustmentReason =
    "Corrección sintética contra fecha de nacimiento validada · " + Date.now();
  const loaded = [];
  for (const sample of [1, 2]) {
    await p
      .getByRole("button", { name: "Importar fuentes", exact: true })
      .click();
    const raw = await run("Cargar fuente sintética " + sample, "sample");
    assert.equal(raw.rows.length, 20);
    await expect(p.getByLabel("Mapeo nombre", { exact: true })).toHaveValue(
      sample === 1 ? "Nombre de beneficiaria" : "paciente",
    );
    await expect(
      p.getByLabel("Mapeo fecha_nacimiento", { exact: true }),
    ).toHaveValue(sample === 1 ? "Nacimiento" : "fecha_nac");
    await p
      .getByLabel("Valor programa", { exact: true })
      .fill("Prevención comunitaria");
    await p
      .getByLabel("Valor categoria", { exact: true })
      .selectOption("Atención");
    if (sample === 1) await screenshot("01-mapeo.png");
    let b = await run("Confirmar mapeo y analizar", "map");
    await expect(p.locator(".quality-panel")).toBeVisible();
    const counts = {};
    b.rows.forEach((r) =>
      r.anomalies.forEach((a) => (counts[a.rule] = (counts[a.rule] || 0) + 1)),
    );
    console.log(
      "FUENTE " +
        sample +
        " · mapeo confirmado · 20 filas · reglas " +
        JSON.stringify(counts),
    );
    if (sample === 1) {
      await screenshot("02-calidad.png");
      const bad = b.rows.find((r) =>
        r.anomalies.some((a) => a.rule === "formato_fecha_nacimiento"),
      );
      assert.ok(bad);
      await p
        .getByRole("button", {
          name: "Corregir fila " + bad.row_number,
          exact: true,
        })
        .click();
      await p
        .getByLabel("Ajustar fecha_nacimiento", { exact: true })
        .fill("1985-03-12");
      await p
        .getByLabel("Motivo ajuste", { exact: true })
        .fill(adjustmentReason);
      b = await run("Guardar ajuste manual", "adjust");
      await expect(
        p.getByRole("dialog", { name: "Ajuste manual" }),
      ).toHaveCount(0);
      console.log(
        "AJUSTE MANUAL fecha inválida corregida · motivo obligatorio · autor/fecha/antes/después auditados",
      );
    }
    await p
      .getByRole("button", { name: "Excluir filas con errores", exact: true })
      .click();
    await p
      .getByRole("button", { name: "Aceptar avisos pendientes", exact: true })
      .click();
    for (const r of b.rows) {
      const select = p.getByLabel("Identidad fila " + r.row_number, {
        exact: true,
      });
      if (r.anomalies.some((a) => a.severity === "error")) {
        await expect(select).toHaveValue("exclude");
        continue;
      }
      const prior =
        r.matches.find(
          (m) =>
            m.id.startsWith("EIRA-") &&
            m.fecha_nacimiento === r.data.fecha_nacimiento,
        ) ||
        r.matches.find(
          (m) =>
            m.id.startsWith("IMP-") &&
            m.fecha_nacimiento === r.data.fecha_nacimiento,
        ) ||
        r.matches.find((m) => m.id.startsWith("EIRA-"));
      await select.selectOption(prior?.id || "new");
    }
    await run("Guardar decisiones de calidad", "decide");
    await expect(
      p.getByRole("button", { name: "Consolidar lote", exact: true }),
    ).toBeEnabled();
    const consolidated = await run("Consolidar lote", "consolidate");
    loaded.push(consolidated.id);
    await expect(p.getByTestId("indicator-personas")).toBeVisible();
    console.log(
      "CONSOLIDACIÓN " +
        sample +
        " · " +
        consolidated.rows.filter((r) => r.included).length +
        " incluidas · " +
        consolidated.rows.filter((r) => !r.included).length +
        " excluidas · identidad confirmada por fila",
    );
  }
  const res = await c.request.get("/api/impacto");
  const body = await res.json(),
    r = body.report;
  assert.ok(r.personas < r.counts["Atención"]);
  assert.ok(r.sources.includes("Fuente sintética 1"));
  assert.ok(r.sources.includes("Fuente sintética 2"));
  assert.ok(r.adjustments.some((a) => a.detalle.motivo === adjustmentReason));
  const a = await (
      await c.request.get("/api/impacto?batch=" + loaded[0])
    ).json(),
    b = await (await c.request.get("/api/impacto?batch=" + loaded[1])).json();
  const set = new Set(a.rows.filter((r) => r.included).map((r) => r.person_id));
  assert.ok(b.rows.some((r) => r.included && set.has(r.person_id)));
  await expect(
    p.locator(".impact-charts .recharts-bar-rectangles").first(),
  ).toBeVisible();
  await screenshot("03-indicadores.png");
  console.log(
    "INDICADORES personas únicas " +
      r.personas +
      " < atenciones (categoría) " +
      r.counts["Atención"] +
      " · fuentes solapadas con persona compartida · ratio " +
      r.ratio.toFixed(2),
  );
  console.log(
    "SEPARACIÓN " +
      JSON.stringify(r.counts) +
      " · " +
      r.total +
      " actividades totales · " +
      r.duplicatesOmitted +
      " duplicados de actividad omitidos",
  );
  await p
    .getByLabel("Filtro impacto programa", { exact: true })
    .selectOption("Prevención comunitaria");
  await expect(
    p.getByTestId("indicator-atenciones").locator("strong"),
  ).not.toHaveText("0");
  const filtered = await c.request.get(
    "/api/impacto?programa=" + encodeURIComponent("Prevención comunitaria"),
  );
  assert.ok(
    (await filtered.json()).report.records.every(
      (a) => a.programa === "Prevención comunitaria",
    ),
  );
  await p.getByRole("button", { name: "Limpiar filtros", exact: true }).click();
  await expect(
    p.getByTestId("indicator-personas").locator("strong"),
  ).toHaveText(String(r.personas));
  for (const [label, name] of [
    ["Exportar CSV", "informe-impacto.csv"],
    ["Informe de impacto PDF", "informe-impacto.pdf"],
  ]) {
    const promise = p.waitForEvent("download");
    await p.getByRole("link", { name: label, exact: true }).click();
    const download = await promise;
    await download.saveAs(join(evidence, name));
  }
  const csv = await readFile(join(evidence, "informe-impacto.csv"), "utf8");
  assert.ok(csv.includes("ANEXO"));
  assert.ok(csv.includes(adjustmentReason));
  assert.ok(csv.includes("admin"));
  const bytes = await readFile(join(evidence, "informe-impacto.pdf"));
  assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
  const pdf = await PDFDocument.load(bytes);
  const text = pdf.context
    .enumerateIndirectObjects()
    .filter(([, o]) => o instanceof PDFRawStream)
    .flatMap(([, o]) => {
      const stream = o.getContents();
      const plain =
        o.dict.get(PDFName.of("Filter"))?.toString() === "/FlateDecode"
          ? inflateSync(stream)
          : stream;
      return [
        ...Buffer.from(plain)
          .toString("latin1")
          .matchAll(/<([0-9a-f]+)>\s*Tj/gi),
      ].map((m) => Buffer.from(m[1], "hex").toString("latin1"));
    })
    .join(" ");
  assert.ok(text.includes("ANEXO"));
  assert.ok(text.includes("admin"));
  assert.ok(
    text.replace(/\s/g, "").includes(adjustmentReason.replace(/\s/g, "")),
  );
  console.log(
    "EXPORTACIÓN CSV + PDF Informe de impacto · filtros/corte/fuentes/denominadores · anexo con motivo, autor y fecha",
  );
  await p
    .getByRole("button", { name: "Diccionario de datos", exact: true })
    .click();
  await expect(p.locator(".dictionary-panel tbody tr")).toHaveCount(12);
  await p
    .getByRole("button", { name: "Importar fuentes", exact: true })
    .click();
  const workbook = new ExcelJS.Workbook(),
    sheet = workbook.addWorksheet("Datos");
  sheet.addRow([
    "nombre",
    "fecha_nacimiento",
    "municipio",
    "tipo_servicio",
    "fecha",
  ]);
  sheet.addRow([
    "Persona Excel Sintética",
    new Date("1980-03-12T00:00:00Z"),
    "Tuxpan",
    "Orientación",
    "2026-06-15",
  ]);
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const upload = p.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === "/api/impacto" &&
      r.request().headers()["content-type"]?.includes("multipart/form-data"),
  );
  await p.getByLabel("Archivo de impacto", { exact: true }).setInputFiles({
    name: "fuente-excel.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer,
  });
  const imported = await upload;
  assert.equal(imported.status(), 200);
  assert.equal(
    (await imported.json()).rows[0].raw.fecha_nacimiento,
    "1980-03-12",
  );
  console.log(
    "XLSX ExcelJS: archivo arbitrario leído · celdas fecha normalizadas · diccionario 12 campos",
  );
  await p.goto("/admin");
  await expect(p.locator(".module-kpi")).toHaveCount(4);
  await expect(p.locator(".module-kpis")).toContainText("PAP no leídos");
  const kpis = await (await c.request.get("/api/admin/kpis")).json();
  const conflictInbox = await (
    await c.request.get("/api/admin/conflicts")
  ).json();
  assert.equal(kpis.conflictos, conflictInbox.conflicts.length);
  for (const [index, key] of [
    "personas",
    "criticos",
    "pap_no_leidos",
    "conflictos",
  ].entries()) {
    assert.ok(Number.isInteger(kpis[key]) && kpis[key] >= 0);
    await expect(
      p.locator(".module-kpi").nth(index).locator("strong"),
    ).toHaveText(String(kpis[key]));
  }
  const municipal = await browser.newContext({ baseURL });
  await municipal.request.post("/api/auth/login", {
    data: { email: "municipio@eira.mx", password: "eira2026" },
  });
  assert.equal((await municipal.request.get("/api/impacto")).status(), 403);
  assert.equal(
    (
      await municipal.request.post("/api/impacto", {
        data: { action: "sample", sample: 1 },
      })
    ).status(),
    403,
  );
  await municipal.close();
  console.log(
    "RBAC importación/indicadores admin-only · dashboard incorpora municipios, PAP, conflictos e importaciones",
  );
  assert.deepEqual(errors, []);
  console.log("PASS PHASE 4 · 0 errores de navegador");
} catch (e) {
  await p
    .screenshot({ path: join(evidence, "failure.png"), fullPage: true })
    .catch(() => {});
  throw e;
} finally {
  await browser.close();
}
