import assert from "node:assert/strict";
// Cada import lleva ?n para saltar el cache de modulos y reevaluar demo.js con el entorno de ese momento.
let n = 0;
const importar = (entorno) => {
  process.env.MODO_DEMO = "1";
  for (const k of ["VERCEL_ENV"]) delete process.env[k];
  Object.assign(process.env, entorno);
  return import(`../lib/demo.js?n=${n++}`);
};
for (const env of ["production", "preview"]) {
  await assert.rejects(() => importar({ VERCEL_ENV: env }), /bloqueado/, `MODO_DEMO bloqueado en ${env}`);
  console.log(`OK demo bloqueado en ${env}`);
}
assert.equal((await importar({})).MODO_DEMO, true, "local (sin VERCEL_ENV) sigue permitido");
assert.equal((await importar({ VERCEL_ENV: "development" })).MODO_DEMO, true, "vercel dev permitido");
process.env.MODO_DEMO = "0";
process.env.VERCEL_ENV = "production";
assert.equal((await import(`../lib/demo.js?n=${n++}`)).MODO_DEMO, false, "sin MODO_DEMO produccion normal");
console.log("RESUMEN: tests=5 estado=verde");
