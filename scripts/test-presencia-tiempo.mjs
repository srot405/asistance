// Traduccion PURA veredicto de tiempo -> estado de Presencia (TOC-146, D2). Sin I/O, datos sinteticos.
import assert from "node:assert/strict";
import { PRESENCIA, contarPresencia, estadoPresenciaOficial } from "../lib/presenciaTiempo.mjs";
import { CODIGOS_CELDA } from "../lib/codigosCelda.mjs";
import { LEYENDA } from "../lib/reporteSemana.mjs";
import { cumple50Pct } from "../lib/tiempoVista.mjs";
import { renderizar } from "./render-componente.mjs";

const t = (estado_tiempo) => ({ estado_tiempo });
assert.equal(estadoPresenciaOficial(false, undefined), PRESENCIA.NUNCA_ENTRO, "sin ingreso -> nunca entro");
assert.equal(estadoPresenciaOficial(false, t("cumple")), PRESENCIA.NUNCA_ENTRO, "asist_entradas manda sobre el tiempo");
assert.equal(estadoPresenciaOficial(true, t("cumple")), PRESENCIA.PRESENTE);
assert.equal(estadoPresenciaOficial(true, t("rojo_tiempo")), PRESENCIA.PARCIAL);
assert.equal(estadoPresenciaOficial(true, t("sin_dato_tiempo")), PRESENCIA.SIN_DATO, "no medido NUNCA es Parcial");
assert.equal(estadoPresenciaOficial(true, t("pendiente")), PRESENCIA.SIN_DATO);
assert.equal(estadoPresenciaOficial(true, undefined), PRESENCIA.SIN_DATO, "entro sin fila de tiempo");
assert.equal(estadoPresenciaOficial(true, null), PRESENCIA.SIN_DATO);
// borde del 50 %: lo decide el veredicto del backend (misma funcion de la pestaña Tiempo), no esta capa
assert.equal(cumple50Pct(50), true); assert.equal(cumple50Pct(49.9), false);

assert.deepEqual(contarPresencia(["presente", "parcial", "parcial", "sin_dato", "nunca_entro"]),
  { presente: 1, parcial: 2, nunca_entro: 1, sin_dato: 1 });
assert.deepEqual(contarPresencia([]), { presente: 0, parcial: 0, nunca_entro: 0, sin_dato: 0 });

// Leyenda global: los 6 codigos del pedido, cada uno con texto, y consistentes con la leyenda del CSV
assert.deepEqual(CODIGOS_CELDA.map((c) => c.codigo), ["SI", "NO", "NO?", "ZL", "P", "SC"]);
for (const c of CODIGOS_CELDA) { assert.ok(c.texto.length > 10, c.codigo); assert.ok(LEYENDA.includes(`${c.codigo}=`), `${c.codigo} esta en la leyenda del CSV`); }

// El encabezado muestra la leyenda global con los 6 codigos
const leyenda = await renderizar("components/LeyendaCodigos.tsx", {});
for (const c of CODIGOS_CELDA) assert.ok(leyenda.includes(c.codigo) && leyenda.includes(c.texto), `leyenda renderiza ${c.codigo}`);
const enc = await renderizar("components/Encabezado.tsx", { dark: false, setDark: () => {}, demo: false });
assert.ok(enc.includes("Leyenda de códigos"), "el encabezado incluye la leyenda");

console.log("RESUMEN: tests=presencia-tiempo estados=4 borde_50=veredicto_backend leyenda=6_codigos estado=verde");
