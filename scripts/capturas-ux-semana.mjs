import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { agregarDatos, crearCorteVisual } from "../lib/agregados.ts";
import { construirCsv } from "../lib/exportar.mjs";

const root = resolve(import.meta.dirname, "..");
const base = process.env.UX_DEMO_BASE ?? "http://localhost:3000";
const rawWeek = JSON.parse(await readFile(resolve(root, "data/demo/semana-2026-09-14.json"), "utf8"));
const baseWeek = agregarDatos(rawWeek);
const currentWeek = agregarDatos({ semana: "2026-09-28", roster: [], franjas: [], entradas: [],
  celdas_dia: [], celdas_semana: [], no_identificados: [], semana_registrada: false });

function demoDeTamano(total) {
  const slots = baseWeek.franjas_con_clase;
  const participantes = Array.from({ length: total }, (_, index) => {
    const slot = slots[index % slots.length];
    const bucket = index % 10;
    const estado = bucket < 4 ? "V" : bucket < 6 ? "A" : index % 13 === 0 ? "R?" : "R";
    return { key: `demo-${index + 1}`, franja: slot.slot_id, franjas: [slot.slot_id],
      estado_semana: estado === "V" || estado === "A" ? "SI" : "NO",
      propia: estado === "V", rescatada: estado === "A", ingreso_en_semana: ["V", "A"].includes(estado),
      falta_hasta_hoy: !["V", "A"].includes(estado), estado_por_franja: { [slot.slot_id]: estado } };
  });
  const totalCut = crearCorteVisual(participantes, slots);
  const dias_visibles = [...new Set(slots.map((s) => s.fecha))].sort().map((fecha) => {
    const cut = crearCorteVisual(participantes, slots, { fecha });
    return { fecha, noIngresaron: cut.noIngresaron, rescataron: cut.rescataron,
      sinIngresarHastaHoy: cut.sinIngresarHastaHoy };
  });
  return { ...baseWeek, participantes, dias_visibles,
    faltantes_por_franja: totalCut.grupos_faltantes,
    resumen: { ...baseWeek.resumen, roster: total, medible: total,
      entro: totalCut.participantes.filter((p) => p.estado_visual === "propia").length,
      aOtra: totalCut.rescataron, falto: totalCut.sinIngresarHastaHoy,
      si: total - totalCut.sinIngresarHastaHoy },
    counts: { ...baseWeek.counts, roster: total, NO: totalCut.sinIngresarHastaHoy },
  };
}

let activeDemo = demoDeTamano(52);
let browser;
try {
  assert.equal((await fetch(base)).ok, true, "servidor local del frontend responde");
  assert.equal((await fetch(`${base}/api/exportar?semana=2026-09-14&vista=Resumen`)).status, 401,
    "sin token la ruta deniega acceso");
  for (const vista of ["Resumen", "Asistencia por horario"]) {
    const csv = construirCsv(activeDemo, vista, true).contenido;
    const expected = vista === "Resumen" ? '"fecha","franja","roster","entro","a_otra","falto"'
      : '"nombre","franja","estado_semanal"';
    assert.ok(csv.startsWith(expected), `encabezado CSV ${vista}`);
    assert.equal(csv.includes("Estudiante "), false, "demo no expone nombres de fixtures");
  }
  await mkdir(resolve(root, "capturas"), { recursive: true });
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.route("**/api/semanas**", async (route) => route.fulfill({ json: {
    semanas: [activeDemo, currentWeek], semanaActual: "2026-09-28", semanaActualRegistrada: false,
  } }));
  await page.route("**/api/datos**", async (route) => {
    const week = new URL(route.request().url()).searchParams.get("semana");
    return route.fulfill({ json: week === "2026-09-14" ? activeDemo : currentWeek });
  });
  await page.route("**/api/exportar**", async (route) => {
    const q = new URL(route.request().url()).searchParams;
    const csv = construirCsv(activeDemo, q.get("vista"), true);
    return route.fulfill({ status: 200, contentType: "text/csv; charset=utf-8", headers: {
      "Cache-Control": "private, no-store", "Content-Disposition": `attachment; filename="asistencia_2026-09-14_${csv.archivo}.csv"`,
    }, body: csv.contenido });
  });
  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push(e.message));

  await page.goto(`${base}/?demo=1`, { waitUntil: "networkidle" });
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.getByText("El roster de esta semana todavía no se ha congelado (se hace el lunes a las 06:00).").waitFor();
  await page.screenshot({ path: resolve(root, "capturas/ux-semana-actual-vacia-2026-09-28-v2.png"), fullPage: true });

  async function capturar(total) {
    activeDemo = demoDeTamano(total);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${base}/?demo=1&semana=2026-09-14`, { waitUntil: "networkidle" });
    await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
    await page.getByRole("heading", { name: "La semana, de un vistazo" }).waitFor();
    const mainTiles = page.locator(".week-visual .participant-tile");
    assert.equal(await mainTiles.count(), total, `${total}: una ficha por persona`);
    assert.equal(new Set(await mainTiles.locator(".participant-name").allTextContents()).size, total,
      `${total}: etiquetas demo únicas y sintéticas`);
    assert.equal(await page.getByText("Sin clase en este corte").count(), 0);
    const missingHeader = Number(await page.locator(".missing-panel h2 small").innerText());
    assert.equal(await page.locator(".missing-panel .participant-tile").count(), missingHeader,
      `${total}: encabezado y Faltaron coinciden`);
    const desktopHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    assert.ok(desktopHeight < 10000, `${total}: alto escritorio razonable (${desktopHeight}px)`);
    await page.screenshot({ path: resolve(root, `capturas/ux-semana-${total}-desktop-2026-09-28.png`), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    const mobile = await page.evaluate(() => ({ width: document.documentElement.scrollWidth,
      viewport: document.documentElement.clientWidth, height: document.documentElement.scrollHeight }));
    assert.ok(mobile.width <= mobile.viewport, `${total}: sin overflow móvil`);
    assert.ok(mobile.height < 26000, `${total}: alto móvil razonable (${mobile.height}px)`);
    await page.screenshot({ path: resolve(root, `capturas/ux-semana-${total}-mobile-2026-09-28.png`), fullPage: true });
    return { desktopHeight, mobileHeight: mobile.height, faltaron: missingHeader };
  }

  const small = await capturar(52);
  const large = await capturar(700);
  activeDemo = demoDeTamano(52);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${base}/?demo=1&semana=2026-09-14`, { waitUntil: "networkidle" });
  const originalCount = await page.locator(".week-visual .participant-tile").count();
  await page.getByLabel("Día").selectOption(activeDemo.dias_visibles[0].fecha);
  assert.ok(await page.locator(".week-visual .participant-tile").count() < originalCount,
    "el filtro de día excluye a quien no pertenece al corte");
  await page.getByLabel("Franja").selectOption(activeDemo.franjas_con_clase[0].slot_id);
  const slotExpected = activeDemo.participantes.filter((p) => p.franjas.includes(activeDemo.franjas_con_clase[0].slot_id)).length;
  assert.equal(await page.locator(".week-visual .participant-tile").count(), slotExpected,
    "el filtro de franja muestra solo su roster");
  const downloadSummary = page.waitForEvent("download");
  await page.getByRole("button", { name: /Exportar CSV/ }).click();
  assert.equal((await downloadSummary).suggestedFilename(), "asistencia_2026-09-14_resumen.csv");
  assert.deepEqual(consoleErrors, []);
  console.log(`RESUMEN: api_401=ok demo_52_alto=${small.desktopHeight}/${small.mobileHeight} demo_700_alto=${large.desktopHeight}/${large.mobileHeight} faltaron_52=${small.faltaron} faltaron_700=${large.faltaron} nombres_demo=ocultos errores_cliente=0 estado=verde`);
} catch (e) {
  console.error("Capturas/prueba UX falló:", e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
} finally {
  await browser?.close();
}
