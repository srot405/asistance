// Capturas de escritorio/móvil de la pestaña "Presencia" y del gráfico nuevo
// de la pestaña "Historial" (TOC-91, pedido de Samuel 2026-09-29, continuación
// de la sesión cortada). No se versiona (capturas/ está en .gitignore) -- solo
// evidencia para la entrega de esta sesión. Mismo patrón que
// capturas-calendario-toc91.mjs.
import { mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { chromium } from "playwright";

const root = resolve(import.meta.dirname, "..");
let port = 3000;
let server = null;
async function demoActivo(p) {
  try { const r = await fetch(`http://localhost:${p}/api/datos?demo=1`); return r.ok; } catch { return false; }
}
let browser;
try {
  if (!(await demoActivo(port))) {
    port = 3412;
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", String(port)], {
      cwd: root, env: { ...process.env, MODO_DEMO: "1", VERCEL_ENV: "development" }, stdio: ["ignore", "pipe", "pipe"],
    });
    const salida = [];
    server.stdout.on("data", (chunk) => salida.push(String(chunk)));
    server.stderr.on("data", (chunk) => salida.push(String(chunk)));
    let arriba = false;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      if (await demoActivo(port)) { arriba = true; break; }
      await new Promise((r) => setTimeout(r, 1000));
    }
    if (!arriba) throw new Error(`el servidor no respondió a tiempo:\n${salida.join("")}`);
  }
  await mkdir(resolve(root, "capturas"), { recursive: true });
  browser = await chromium.launch({ headless: true });
  const errores = [];

  async function nuevaPagina(mobile) {
    const page = await browser.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 } });
    page.on("pageerror", (e) => errores.push(e.message));
    page.on("console", (m) => { if (m.type() === "error") errores.push(m.text()); });
    await page.goto(`http://localhost:${port}/?demo=1`, { waitUntil: "commit", timeout: 60000 });
    await page.getByRole("heading", { name: "Ingresos a clases virtuales" }).waitFor({ timeout: 30000 });
    // Semana nivel Detalle: la única donde Presencia tiene datos.
    await page.locator(".historical-toolbar select").selectOption("2026-09-14|Backend");
    return page;
  }

  for (const mobile of [false, true]) {
    const sufijo = mobile ? "movil" : "escritorio";
    const page = await nuevaPagina(mobile);

    // 1) Pestaña "Presencia": 3 categorías del reporte en vivo, para la clase por defecto.
    await page.getByRole("tab", { name: "Presencia" }).click();
    await page.locator(".presencia-grid").waitFor({ state: "visible", timeout: 15000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: resolve(root, `capturas/presencia-${sufijo}.png`), fullPage: true });

    // 2) Cambiar de clase en el selector -> vuelve a pedir /api/presencia.
    await page.locator(".presencia-selector select").selectOption({ index: 2 });
    await page.locator(".presencia-grid").waitFor({ state: "visible" });
    await page.waitForTimeout(300);
    await page.screenshot({ path: resolve(root, `capturas/presencia-otra-clase-${sufijo}.png`), fullPage: true });

    // 3) Pestaña "Historial": gráfico de tendencia (SVG) + barras de texto debajo.
    await page.getByRole("tab", { name: "Historial" }).click();
    await page.locator(".trend-chart-svg").waitFor({ state: "visible" });
    await page.waitForTimeout(300);
    await page.screenshot({ path: resolve(root, `capturas/historial-grafico-${sufijo}.png`), fullPage: true });

    await page.close();
  }

  if (errores.length) throw new Error(`errores de cliente: ${errores.join(" | ")}`);
  console.log("RESUMEN: capturas=6 (presencia/presencia-otra-clase/historial-grafico x escritorio+movil) errores_cliente=0 estado=verde");
} finally {
  await browser?.close();
  server?.kill();
}
