const BASE = (process.env.PANEL_URL || "http://localhost:3000").replace(
  /\/$/,
  "",
);
async function check(path, token) {
  const r = await fetch(BASE + path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return { status: r.status, body: await r.text() };
}
const no = await check("/api/datos?semana=2026-09-14");
const fake = await check("/api/datos?semana=2026-09-14", "fake-token");
const ok = no.status === 401 && fake.status === 401;
console.log(`${ok ? "OK" : "FALLA"} sin token → HTTP ${no.status}`);
console.log(`${ok ? "OK" : "FALLA"} token falso → HTTP ${fake.status}`);
console.log(`RESUMEN: tests=2 estado=${ok ? "verde" : "rojo"}`);
process.exitCode = ok ? 0 : 1;
