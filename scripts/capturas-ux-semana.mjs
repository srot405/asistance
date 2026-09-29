import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { HISTORICO_DEMO, SOLO_SEMANAL_UX } from "../lib/historico-demo.mjs";

const root = resolve(import.meta.dirname, "..");
const base = process.env.UX_DEMO_BASE ?? "http://127.0.0.1:3100";
const soloData = { ...HISTORICO_DEMO, resultados: HISTORICO_DEMO.resultados.map((fila) =>
  fila.semana === SOLO_SEMANAL_UX.semana && fila.materia === SOLO_SEMANAL_UX.materia ? SOLO_SEMANAL_UX : fila) };

await mkdir(resolve(root, "capturas"), { recursive: true });
const browser = await chromium.launch({ headless: true });
const errores = [];

async function capturar({ data, value, name, mobile = false, clip, pestana }) {
  const page = await browser.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    deviceScaleFactor: 1 });
  page.on("pageerror", (error) => errores.push(error.message));
  await page.route("**/api/datos**", (route) => route.fulfill({ json: data }));
  await page.goto(`${base}/?demo=1`, { waitUntil: "commit", timeout: 60000 });
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.locator(".historical-toolbar select").selectOption(value);
  await page.getByRole("heading", { name: "Ingresos a clases virtuales" }).waitFor();
  // TOC-91 (2026-09-29): "Tendencia semanal" pasó a vivir en la pestaña
  // "Historial", ya no visible por defecto en la vista "Semana".
  if (pestana) await page.getByRole("tab", { name: pestana }).click();
  assert.equal(await page.locator(".participant-tile,.participant-name").count(), 0, "no hay fichas nominales");
  assert.equal((await page.locator("body").innerText()).includes("Estudiante "), false, "sin nombres demo");
  const path = resolve(root, `capturas/${name}-${mobile ? "movil" : "escritorio"}-2026-09-28.png`);
  if (clip) await page.locator(clip).screenshot({ path });
  else await page.screenshot({ path, fullPage: true });
  await page.close();
  return path;
}

for (const mobile of [false, true]) {
  await capturar({ data: HISTORICO_DEMO, value: "2026-09-14|Backend", name: "historico-detalle", mobile });
  await capturar({ data: soloData, value: `${SOLO_SEMANAL_UX.semana}|${SOLO_SEMANAL_UX.materia}`, name: "historico-solo-semanal", mobile });
  await capturar({ data: HISTORICO_DEMO, value: "2026-09-21|Backend", name: "historico-tendencia", mobile,
    pestana: "Historial", clip: ".trend-panel" });
}
assert.equal(errores.length, 0, `errores de cliente: ${errores.join(" | ")}`);
await browser.close();
console.log("RESUMEN: capturas=6 detalle=2 solo_semanal=2 tendencia=2 nominal=ausente errores_cliente=0 estado=verde");
