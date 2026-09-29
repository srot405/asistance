// Capturas de escritorio/móvil del calendario + pestaña Historial + filtros
// (TOC-91, pedido de Samuel 2026-09-29). No se versiona (capturas/ está en
// .gitignore) -- solo evidencia para la entrega de esta sesión.
import { mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { chromium } from "playwright";

const root = resolve(import.meta.dirname, "..");
// Si ya hay un `next dev` corriendo (con MODO_DEMO=1) lo reutiliza -- Next.js
// rechaza levantar una segunda instancia en la misma carpeta. Si no, levanta la suya.
let port = 3000;
let server = null;
async function demoActivo(p) {
  try { const r = await fetch(`http://localhost:${p}/api/datos?demo=1`); return r.ok; } catch { return false; }
}
let browser;
try {
  if (!(await demoActivo(port))) {
    port = 3411;
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
    // "commit" en vez de "networkidle": el HMR de `next dev` mantiene una
    // conexión abierta que nunca deja la red en reposo (mismo motivo que
    // capturas-ux-semana.mjs).
    await page.goto(`http://localhost:${port}/?demo=1`, { waitUntil: "commit", timeout: 60000 });
    await page.getByRole("heading", { name: "Ingresos a clases virtuales" }).waitFor({ timeout: 30000 });
    // Semana nivel Detalle (roster congelado real en el demo): la única donde el
    // calendario tiene días clicables y filtros/CSV nominal habilitados.
    await page.locator(".historical-toolbar select").selectOption("2026-09-14|Backend");
    await page.locator(".calendar-panel").waitFor({ state: "visible" });
    return page;
  }

  for (const mobile of [false, true]) {
    const sufijo = mobile ? "movil" : "escritorio";
    const page = await nuevaPagina(mobile);

    // 1) Vista "Semana" por defecto: calendario + agregado de la semana completa.
    await page.waitForTimeout(400); // deja resolver el fetch a /api/detalle
    await page.screenshot({ path: resolve(root, `capturas/calendario-semana-${sufijo}.png`), fullPage: true });

    // 2) Click en un día con datos -> detalle de ese día a la derecha/abajo.
    await page.locator(".calendar-day.con-datos").first().click();
    await page.locator(".calendar-detail strong").waitFor({ state: "visible" });
    await page.screenshot({ path: resolve(root, `capturas/calendario-dia-${sufijo}.png`), fullPage: true });

    // 3) Filtro de ciudad: vuelve a pedir /api/detalle con ciudad= y refiltra.
    const ciudad = await page.locator(".calendar-filters select").first();
    await ciudad.selectOption({ index: 1 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: resolve(root, `capturas/calendario-filtro-ciudad-${sufijo}.png`), fullPage: true });

    // 4) Pestaña "Historial": la tendencia entre semanas, separada de "Semana".
    await page.getByRole("tab", { name: "Historial" }).click();
    await page.locator(".trend-panel").waitFor({ state: "visible" });
    await page.screenshot({ path: resolve(root, `capturas/historial-${sufijo}.png`), fullPage: true });

    await page.close();
  }

  if (errores.length) throw new Error(`errores de cliente: ${errores.join(" | ")}`);
  console.log("RESUMEN: capturas=8 (semana/dia/filtro-ciudad/historial x escritorio+movil) errores_cliente=0 estado=verde");
} finally {
  await browser?.close();
  server?.kill();
}
