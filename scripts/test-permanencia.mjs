import assert from "node:assert/strict";
import { probarPermanencia } from "../lib/permanencia.test.mjs";
import { renderizar } from "./render-componente.mjs";

const resultado = probarPermanencia();
assert.equal(resultado.comprobaciones, 29);
assert.match(await renderizar("components/Permanencia.tsx", {}), /Sin dato/);
for (const [pct, color] of [[59.99, "rojo"], [60, "amarillo"], [79.99, "amarillo"], [80, "verde"]]) {
  assert.match(await renderizar("components/Permanencia.tsx", { pct }), new RegExp(color));
}
console.log(`RESUMEN: permanencia ${resultado.comprobaciones} comprobaciones puras + 5 renderizados OK`);
