import { mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { chromium } from "playwright";

const root = resolve(import.meta.dirname, "..");
const port = 3317;
const nextCommand = process.env.CAPTURA_START === "1" ? "start" : "dev";
const server = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", nextCommand, "-p", String(port)],
  {
    cwd: root,
    env: {
      ...process.env,
      MODO_DEMO: "1",
      // El demo no consulta Supabase, pero el cliente de auth del navegador (lib/auth.ts) exige una URL y lanza
      // "supabaseUrl is required" si falta: sin .env.local (worktree o CI limpio) la página no cargaba y la espera
      // de «Semana abierta» vencía. Valores ficticios (puerto 9, nada escucha) solo si no vienen del entorno.
      NEXT_PUBLIC_SUPABASE_URL:
        process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:9",
      NEXT_PUBLIC_SUPABASE_ANON_KEY:
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "demo-anon-key",
      ...(nextCommand === "dev"
        ? { VERCEL_ENV: "development" }
        : { VERCEL_ENV: "" }),
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
const output = [];
let browser;
server.stdout.on("data", (chunk) => output.push(String(chunk)));
server.stderr.on("data", (chunk) => output.push(String(chunk)));
try {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      if ((await fetch(`http://localhost:${port}`)).ok) break;
    } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  let datos = false;
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /CSP|content security policy/i.test(message.text())
    )
      errors.push(message.text());
  });
  page.on("request", (request) => {
    if (request.url().includes("/api/datos")) datos = true;
  });
  const started = performance.now();
  await page.goto(`http://localhost:${port}/?demo=1`, {
    waitUntil: "networkidle",
  });
  await page.getByText("Semana abierta").waitFor({ state: "visible" });
  const loadMs = Math.round(performance.now() - started);
  await mkdir(resolve(root, "capturas"), { recursive: true });
  await page.screenshot({
    path: resolve(root, "capturas/resumen-claro.png"),
    fullPage: true,
  });
  // Las grillas por persona («Día a día», «Semana a semana», ZOOM-LIMIT, detalle de celda) se eliminaron en
  // bc323c7 (TOC-01, vistas por persona fuera del panel); esta prueba recorre las pestañas que existen hoy.
  const pestanas = [
    ["En vivo", "en-vivo-claro.png"],
    ["Lista en vivo", "lista-vivo-claro.png"],
    ["Presencia", "presencia-claro.png"],
    ["Captura de clases", "captura-clases-claro.png"],
    ["Tiempo", "tiempo-claro.png"],
    ["Estadísticas", "estadisticas-claro.png"],
    ["Historial", "historial-claro.png"],
  ];
  for (const [label, file] of pestanas) {
    const tab = page.getByRole("tab", { name: label, exact: true });
    await tab.click();
    await page
      .locator('[role="tab"][aria-selected="true"]', { hasText: label })
      .waitFor({ state: "visible" });
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: resolve(root, `capturas/${file}`),
      fullPage: true,
    });
  }
  await page.getByRole("tab", { name: "Semana", exact: true }).click();
  await page.getByText("Semana abierta").waitFor({ state: "visible" });
  await page.getByRole("button", { name: /Oscuro/ }).click();
  await page.screenshot({
    path: resolve(root, "capturas/resumen-oscuro.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileMetrics = await page.evaluate(() => ({
    body: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  if (mobileMetrics.body > mobileMetrics.viewport)
    throw new Error(
      `scroll horizontal de página: ${mobileMetrics.body}/${mobileMetrics.viewport}`,
    );
  await page.screenshot({
    path: resolve(root, "capturas/resumen-mobile-390.png"),
    fullPage: true,
  });
  if (pageErrors.length)
    throw new Error(`errores de página: ${pageErrors.join(" | ")}`);
  console.log(
    `RESUMEN: capturas=${pestanas.length + 3} csp_errores=${errors.length} errores_pagina=${pageErrors.length} api_datos=${datos} primera_carga_ms=${loadMs} mobile_horizontal=${mobileMetrics.body > mobileMetrics.viewport}`,
  );
} finally {
  await browser?.close();
  server.kill();
}
