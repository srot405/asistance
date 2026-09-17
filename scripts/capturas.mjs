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
  await page.getByRole("tab", { name: "Día a día" }).click();
  await page.locator(".grid-wrap").first().waitFor({ state: "visible" });
  const rowsMounted = await page.locator(".grid-row:not(.header)").count();
  const gridMetrics = await page
    .locator(".grid-wrap")
    .first()
    .evaluate((element) => ({
      height: element.clientHeight,
      scrollHeight: element.scrollHeight,
      scrollWidth: element.scrollWidth,
    }));
  if (rowsMounted > 40 || gridMetrics.scrollHeight <= gridMetrics.height)
    throw new Error(
      `virtualización inválida: filas=${rowsMounted} scroll=${gridMetrics.scrollHeight}/${gridMetrics.height}`,
    );
  console.log(
    `RESUMEN: filas_dom=${rowsMounted} grid_scroll=${gridMetrics.scrollHeight > gridMetrics.height}`,
  );
  await page.screenshot({
    path: resolve(root, "capturas/dia-claro.png"),
    fullPage: true,
  });
  await page
    .locator(".grid-wrap")
    .first()
    .evaluate((element) => {
      element.scrollTop = 400 * 42;
    });
  await page.waitForTimeout(500);
  const scrolledText = await page.locator(".grid-wrap").first().innerText();
  if (!scrolledText.includes("Estudiante 400"))
    throw new Error("la fila aproximada 400 no quedó visible");
  const dayHeader = await page.locator(".grid-wrap").first().evaluate((element) => {
    const header = element.querySelector(".grid-row.header");
    const wrap = element.getBoundingClientRect();
    const style = header && getComputedStyle(header);
    const hit = document.elementFromPoint(wrap.left + 10, wrap.top + 10);
    return {
      visible: Boolean(header && header.getBoundingClientRect().top <= wrap.top + 2),
      zIndex: style?.zIndex,
      background: style?.backgroundColor,
      hitHeader: Boolean(hit?.closest(".grid-row.header")),
    };
  });
  if (!dayHeader.visible || !dayHeader.hitHeader)
    throw new Error(`encabezado Día a día no visible: ${JSON.stringify(dayHeader)}`);
  await page.screenshot({ path: resolve(root, "capturas/dia-scrolleado.png") });
  await page.getByRole("tab", { name: "Semana a semana" }).click();
  const weeklyGrid = page.locator(".grid-wrap").first();
  await weeklyGrid.waitFor({ state: "visible" });
  await page.screenshot({
    path: resolve(root, "capturas/semana-claro.png"),
    fullPage: true,
  });
  await weeklyGrid.evaluate((element) => {
    element.scrollTop = 400 * 42;
  });
  await page.waitForTimeout(500);
  const weeklyScrolledText = await weeklyGrid.innerText();
  if (!weeklyScrolledText.includes("Estudiante 400"))
    throw new Error("la fila aproximada 400 no quedó visible en Semana a semana");
  const weekHeader = await weeklyGrid.evaluate((element) => {
    const header = element.querySelector(".grid-row.header");
    const wrap = element.getBoundingClientRect();
    const style = header && getComputedStyle(header);
    const hit = document.elementFromPoint(wrap.left + 10, wrap.top + 10);
    return {
      visible: Boolean(header && header.getBoundingClientRect().top <= wrap.top + 2),
      zIndex: style?.zIndex,
      background: style?.backgroundColor,
      hitHeader: Boolean(hit?.closest(".grid-row.header")),
    };
  });
  if (!weekHeader.visible || !weekHeader.hitHeader)
    throw new Error(`encabezado Semana a semana no visible: ${JSON.stringify(weekHeader)}`);
  await page.screenshot({
    path: resolve(root, "capturas/semana-scrolleado.png"),
  });
  for (const [label, file] of [["ZOOM-LIMIT (0)", "zoom-claro.png"]]) {
    await page.getByRole("tab", { name: label }).click();
    await page.screenshot({
      path: resolve(root, `capturas/${file}`),
      fullPage: true,
    });
  }
  await page.getByRole("tab", { name: "Día a día" }).click();
  await page.getByRole("button", { name: /Oscuro/ }).click();
  await page.screenshot({
    path: resolve(root, "capturas/dia-oscuro.png"),
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
    path: resolve(root, "capturas/dia-mobile-390.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator(".grid-wrap").first().evaluate((element) => {
    element.scrollTop = 0;
  });
  await page.locator("button.cell").first().click({ force: true });
  await page.screenshot({
    path: resolve(root, "capturas/detalle-abierto.png"),
    fullPage: true,
  });
  console.log(
    `RESUMEN: capturas=9 csp_errores=${errors.length} api_datos=${datos} primera_carga_ms=${loadMs} filas_dom=${rowsMounted} mobile_horizontal=${mobileMetrics.body > mobileMetrics.viewport}`,
  );
} finally {
  await browser?.close();
  server.kill();
}
