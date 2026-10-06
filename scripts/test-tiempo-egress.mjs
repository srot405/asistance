import assert from "node:assert/strict";
import { cargarLector } from "./test-tiempo-paginacion.mjs";
import { TIEMPO_DEMO } from "../lib/tiempo-demo.mjs";
import { readFile } from "node:fs/promises";

// M1 (egress): contar llamadas y filas que el servidor pide a Supabase por visita. Supabase simulado.
const d = TIEMPO_DEMO["2026-09-14"];
const personas = d.personas.map((p) => ({ ...p, franja_tiempo: p.slot_id }));
const datos = { asist_tiempo_clase: d.clases, v_asist_tiempo_persona: personas, asist_franjas: d.franjas,
  asist_semanas: [{ congelada_en: null, cerrada_en: null, estado: "abierta", notas: null }], asist_semana_resumen: [d.resumenFila] };
const filasLeidas = (consultas) => consultas.filter((c) => c.rangos.length || c.tabla.startsWith("asist_sem"))
  .reduce((n, c) => n + (c.rangos.length ? Math.min(datos[c.tabla].length, 1000 * c.rangos.length) : 1), 0);
const sobrePersonas = (consultas) => consultas.filter((c) => c.tabla === "v_asist_tiempo_persona" && c.rangos.length).length;

const { lector, consultas } = await cargarLector(datos);
const sem = "2026-09-14";
const ciudad = personas.find((p) => p.ciudad)?.ciudad;
assert.ok(personas.length > 100 && ciudad, "fixture con muchas personas");

// 1) tarjeta ligera: NUNCA lee la vista por persona; mismos conteos que la lectura completa
lector.vaciarCacheTiempo();
const ligera = await lector.leerTiempoSemana(sem, {}, { ligero: true });
assert.equal(sobrePersonas(consultas), 0, "la tarjeta de Semana no lee v_asist_tiempo_persona");
const completa = await lector.leerTiempoSemana(sem, {});
const ligConteos = (r) => JSON.stringify([r.semana_agregada.n_ingresaron, r.semana_agregada.n_medibles, r.semana_agregada.n_cumplen,
  r.semana_agregada.n_rojo, r.semana_agregada.n_sin_dato, r.provisional, r.hay_tiempos]);
assert.equal(ligConteos(ligera), ligConteos(completa), "sin cambiar numeros");
assert.equal(sobrePersonas(consultas), 1, "la lectura completa lee la vista por persona una vez");

// 2) cambiar filtros 4 veces dentro del TTL no vuelve a Supabase
const antes = consultas.length;
const bogota = await lector.leerTiempoSemana(sem, { ciudad });
await lector.leerTiempoSemana(sem, { ciudad: null, cuenta: d.franjas[0].cuenta_zoom });
await lector.leerTiempoSemana(sem, { franja: d.franjas[0].slot_id });
await lector.leerTiempoSemana(sem, {});
assert.equal(consultas.length, antes, "filtros resueltos en memoria: 0 consultas nuevas");
assert.equal(bogota.filtro.ciudad, ciudad, "el filtro si se aplica");
assert.ok(bogota.semana_agregada.n_ingresaron <= completa.semana_agregada.n_ingresaron);

// 3) dos lecturas simultaneas comparten una sola
lector.vaciarCacheTiempo();
const n0 = consultas.length;
await Promise.all([lector.leerTiempoSemana(sem, {}), lector.leerTiempoSemana(sem, { ciudad })]);
assert.equal(sobrePersonas(consultas.slice(n0)), 1, "lecturas concurrentes se comparten");

// 4) TTL: pasado el tiempo se relee; una lectura fallida no queda en cache
lector.vaciarCacheTiempo();
const real = Date.now;
let t = real();
Date.now = () => t;
try {
  const a = consultas.length;
  await lector.leerTiempoSemana(sem, {});
  const b = consultas.length;
  t += lector.TTL_CACHE_TIEMPO_MS + 1;
  await lector.leerTiempoSemana(sem, {});
  assert.equal(consultas.length - b, b - a, "vencido el TTL relee lo mismo que la primera vez");
} finally { Date.now = real; }
const roto = await cargarLector(datos, { asist_tiempo_clase: { code: "XX", message: "boom" } });
await assert.rejects(() => roto.lector.leerTiempoSemana(sem, {}));
const trasFallo = roto.consultas.length;
await assert.rejects(() => roto.lector.leerTiempoSemana(sem, {}));
assert.ok(roto.consultas.length > trasFallo, "un fallo no se cachea");

// 5) cliente/ruta: ligero solo para la tarjeta; la pestana Tiempo no se dispara desde Semana
const dash = await readFile(new URL("../components/Dashboard.tsx", import.meta.url), "utf8");
assert.match(dash, /pestana === "Semana" && Boolean\(actual\)[^;]*, true\);/, "tarjeta: ligera y solo en la pestana Semana");
const hook = await readFile(new URL("../lib/useTiempo.ts", import.meta.url), "utf8");
assert.match(hook, /if \(ligero\) params\.set\("ligero", "1"\);\s*\n\s*else for/, "ligero no manda filtros");
const ruta = await readFile(new URL("../app/api/tiempo/route.ts", import.meta.url), "utf8");
assert.match(ruta, /ligero: params\.get\("ligero"\) === "1"|ligero = params\.get\("ligero"\) === "1"/);

console.log(`RESUMEN: egress_tarjeta_filas_persona=0 filtros_en_memoria=0_consultas ttl=${lector.TTL_CACHE_TIEMPO_MS}ms estado=verde`);
