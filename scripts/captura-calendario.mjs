// Capturas del selector de vista del calendario (TOC-91) en MODO_DEMO (datos sinteticos). Uso local:
//   node scripts/captura-calendario.mjs <carpeta_salida>
// Levanta su propio `next dev` en :3318 con MODO_DEMO=1 y usa el Chrome del sistema (channel "chrome").
import { mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { chromium } from "playwright";

const root = resolve(import.meta.dirname, "..");
const salida = resolve(process.argv[2] ?? "capturas");
const port = 3318;
await mkdir(salida, { recursive: true });
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", String(port)],
  { cwd: root, env: { ...process.env, MODO_DEMO: "1", VERCEL_ENV: "development" }, stdio: ["ignore", "pipe", "pipe"] });
const log = [];
server.stdout.on("data", (c) => log.push(String(c))); server.stderr.on("data", (c) => log.push(String(c)));
let browser;
try {
  for (let i = 0; i < 120; i += 1) { try { if ((await fetch(`http://localhost:${port}`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 500)); }
  browser = await chromium.launch({ headless: true, channel: "chrome" });
  for (const [ancho, oscuro] of [[1440, false], [1440, true], [390, false]]) {
    const page = await browser.newPage({ viewport: { width: ancho, height: 1100 } });
    const errores = [];
    page.on("pageerror", (e) => errores.push(String(e)));
    await page.goto(`http://localhost:${port}/`, { waitUntil: "networkidle" });
    // semana nivel Detalle del demo
    const sel = page.locator("select.control").first();
    const opcion = await sel.locator("option", { hasText: "2026-09-14" }).first().getAttribute("value");
    if (opcion) await sel.selectOption(opcion);
    if (oscuro) { const b = page.getByRole("button", { name: /oscuro|tema|modo/i }).first(); if (await b.count()) await b.click(); }
    await page.locator(".seg-btn").first().waitFor({ timeout: 30000 });
    const cal = page.locator(".calendar-panel");
    const sufijo = `${ancho}${oscuro ? "-oscuro" : ""}`;
    await cal.screenshot({ path: `${salida}/0-ambos-${sufijo}.png` });
    await page.locator('.seg-btn[data-tipo="colados"]').click();
    await cal.screenshot({ path: `${salida}/1-colados-semana-${sufijo}.png` });
    await page.locator(".calendar-day.con-datos").last().click();
    await page.waitForTimeout(400);
    await cal.screenshot({ path: `${salida}/2-colados-dia-${sufijo}.png` });
    await page.locator('.seg-btn[data-tipo="horario"]').click();
    await cal.screenshot({ path: `${salida}/3-horario-dia-${sufijo}.png` });
    if (ancho === 1440 && !oscuro) for (const tab of ["Estadísticas", "Cobertura", "Presencia"]) {
      await page.getByRole("tab", { name: tab }).click();
      await page.waitForTimeout(2500);
      await page.locator("main").screenshot({ path: `${salida}/9-${tab}.png` });
    }
    if (errores.length) console.log("ERRORES", sufijo, errores);
    await page.close();
  }
  console.log("capturas en", salida);
} catch (e) {
  console.error(e); console.error(log.slice(-15).join(""));
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.kill();
}
