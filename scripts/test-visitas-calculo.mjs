// Calculo PURO de la vista «Entro a clase ajena» (TOC-147): totales, cuadre contra asist_tiempo_clase.visitas, supresion n<5 y
// mismo recorte que el CSV nominal. Datos 100 % sinteticos (cedulas 1000000xx, sin correos reales).
import assert from "node:assert/strict";
import { TIEMPO_DEMO } from "../lib/tiempo-demo.mjs";
import { TEXTO_SUPRIMIDO, armarVisitas, cuadrarVisitas, etiquetaMotivo, filtrarVisitas, suprimir } from "../lib/visitasCalculo.mjs";

const franjas = [
  { slot_id: "a", fecha: "2099-01-05", cuenta_zoom: "c1", horario_texto: "Lunes A" },
  { slot_id: "b", fecha: "2099-01-06", cuenta_zoom: "c1", horario_texto: "Martes B" },
  { slot_id: "c", fecha: "2099-01-07", cuenta_zoom: "c2", horario_texto: "Miercoles C" },
];
let n = 0;
const visita = (propia, visitada, extra = {}) => {
  n += 1;
  const f = franjas.find((x) => x.slot_id === visitada);
  return { sesion_id: `${f.fecha}|${visitada}`, franja_tiempo: visitada, fecha: f.fecha, nombre: `Estudiante ${String(n).padStart(3, "0")}`,
    ciudad: "Ciudad X", franja_propia: propia, estado_tiempo: "cumple", pct_tiempo: 80, es_visita: true, ...extra };
};
// a->b x5 (se publica), a->c x2 (suprimida), b->c x1 (suprimida)
const filas = [
  ...Array.from({ length: 5 }, () => visita("a", "b")),
  ...Array.from({ length: 2 }, (_, i) => visita("a", "c", i ? { estado_tiempo: "rojo_tiempo", pct_tiempo: 30 } : {})),
  visita("b", "c", { estado_tiempo: "sin_dato_tiempo", pct_tiempo: null, ciudad: "Ciudad Y" }),
];
const clases = [
  { sesion_id: "2099-01-05|a", slot_id: "a", visitas: 0 },
  { sesion_id: "2099-01-06|b", slot_id: "b", visitas: 5 },
  { sesion_id: "2099-01-07|c", slot_id: "c", visitas: 3 },
];
const noId = [{ sesion_id: "2099-01-05|a", motivo: "sin_correo", cantidad: 2 }, { sesion_id: "2099-01-06|b", motivo: "sin_correo", cantidad: 3 },
  { sesion_id: "2099-01-06|b", motivo: "motivo_nuevo", cantidad: 1 }];

// suprimir
assert.equal(suprimir(0), 0); assert.equal(suprimir(1), null); assert.equal(suprimir(4), null); assert.equal(suprimir(5), 5);
assert.equal(TEXTO_SUPRIMIDO, "<5");

const r = armarVisitas({ semana: "2099-01-05", filas, franjas, clases, noIdentificados: noId });
assert.equal(r.visitas.length, 8);
assert.deepEqual(r.resumen, { total: 8, cumplen: 6, rojo: 1, sin_dato: 1, pendientes: 0 });
assert.equal(r.resumen.cumplen + r.resumen.rojo + r.resumen.sin_dato + r.resumen.pendientes, r.resumen.total);
// el total cuadra con asist_tiempo_clase.visitas
assert.equal(r.visitas.length, clases.reduce((a, c) => a + c.visitas, 0));
assert.deepEqual(r.cuadre, { estado: "OK", detalle: [] });
// pct solo con tiempo medido; el sin dato no lleva pct (nunca 0)
assert.equal(r.visitas.find((v) => v.veredicto === "sin_dato_tiempo").pct_tiempo, null);
assert.equal(r.visitas.find((v) => v.veredicto === "rojo_tiempo").pct_tiempo, 30);
// rotulos de las clases (no ids crudos)
assert.equal(r.visitas[0].horario_propia, "Lunes A"); assert.equal(r.visitas[0].horario_visitada, "Martes B");

// matriz: SIN nombres y con supresion n<5
const celdas = Object.fromEntries(r.matriz.celdas.map((c) => [`${c.origen}>${c.destino}`, c.n]));
assert.deepEqual(celdas, { "a>b": 5, "a>c": null, "b>c": null }, "5 se publica; 2 y 1 salen suprimidas (null -> «<5»)");
const total = (lista, id) => lista.find((t) => t.slot_id === id).n;
assert.equal(total(r.matriz.origenes, "a"), 7); assert.equal(total(r.matriz.origenes, "b"), null);
assert.equal(total(r.matriz.destinos, "b"), 5); assert.equal(total(r.matriz.destinos, "c"), null, "3 visitas a c: total suprimido");
const matrizJson = JSON.stringify(r.matriz);
for (const v of r.visitas) assert.ok(!matrizJson.includes(v.visitante), "la matriz no lleva nombres");
assert.ok(!matrizJson.includes("persona_id") && !matrizJson.includes("correo"));

// sin identificar: suma por motivo, motivo conocido explicado y desconocido tal cual, orden por cantidad
assert.equal(r.sin_identificar.total, 6);
assert.deepEqual(r.sin_identificar.por_motivo.map((m) => [m.motivo, m.cantidad]), [["sin_correo", 5], ["motivo_nuevo", 1]]);
assert.equal(r.sin_identificar.por_motivo[0].etiqueta, etiquetaMotivo("sin_correo"));
assert.equal(etiquetaMotivo("motivo_nuevo"), "motivo_nuevo");

// el cuadre detecta diferencias: total de la clase distinto, sesion sin clase y fecha de otra semana
assert.equal(cuadrarVisitas(filas, clases.map((c) => (c.slot_id === "b" ? { ...c, visitas: 4 } : c)), franjas).estado, "DISCREPA");
assert.match(cuadrarVisitas([...filas, { ...visita("a", "b"), sesion_id: "2099-01-99|z" }], clases, franjas).detalle.join("|"), /sin fila de clase/);
assert.match(cuadrarVisitas([...filas, visita("a", "b", { fecha: "2098-12-29" })], [{ ...clases[1], visitas: 6 }, clases[2]], franjas).detalle.join("|"), /fuera de la semana/);
assert.equal(cuadrarVisitas(filas, [], franjas).estado, "SIN_COMPARAR");

// filas que NO son visitas se ignoran aunque lleguen (defensa: el lector ya filtra por es_visita)
assert.equal(armarVisitas({ semana: "x", filas: [...filas, { ...visita("a", "a"), es_visita: false }], franjas, clases }).visitas.length, 8);

// filtros: mismo recorte que el CSV nominal (ciudad, franja y cuenta de la franja PROPIA)
const f = (filtro) => filtrarVisitas(filas, franjas, filtro).length;
assert.equal(f({}), 8); assert.equal(f({ ciudad: "Ciudad Y" }), 1); assert.equal(f({ franja: "a" }), 7); assert.equal(f({ franja: "b" }), 1);
assert.equal(f({ cuenta: "c1" }), 8, "a y b son de la cuenta c1"); assert.equal(f({ cuenta: "c2" }), 0);
const filtrado = armarVisitas({ semana: "x", filas, franjas, clases, filtro: { franja: "a" } });
assert.equal(filtrado.visitas.length, 7); assert.equal(filtrado.cuadre.estado, "SIN_COMPARAR", "con filtro no se compara contra la clase");
assert.equal(filtrado.filtro.franja, "a");

// sin visitas: respuesta vacia valida (la pantalla explica el vacio)
const vacia = armarVisitas({ semana: "x", filas: [], franjas, clases: clases.map((c) => ({ ...c, visitas: 0 })) });
assert.equal(vacia.visitas.length, 0); assert.deepEqual(vacia.matriz.celdas, []); assert.equal(vacia.cuadre.estado, "OK");

// visitante sin clase propia (sin franja): se rotula aparte, no rompe la matriz
const sinPropia = armarVisitas({ semana: "x", filas: [visita(null, "b")], franjas, clases: [] });
assert.equal(sinPropia.visitas[0].horario_propia, "Sin clase propia"); assert.equal(sinPropia.matriz.origenes[0].horario_texto, "Sin clase propia");

// Demo: las 3 semanas cuadran contra asist_tiempo_clase.visitas y la matriz suprime las celdas chicas
let conVisitas = 0, conSuprimidas = 0;
for (const [semana, d] of Object.entries(TIEMPO_DEMO)) {
  const v = armarVisitas({ semana, filas: d.personas, franjas: d.franjas, clases: d.clases, noIdentificados: d.noIdentificados });
  assert.equal(v.cuadre.estado, "OK", `${semana}: ${v.cuadre.detalle}`);
  assert.equal(v.visitas.length, d.clases.reduce((a, c) => a + c.visitas, 0), `${semana}: total = suma de asist_tiempo_clase.visitas`);
  assert.ok(v.matriz.celdas.every((c) => c.n === null || c.n >= 5), `${semana}: ninguna celda publicada con menos de 5`);
  if (v.visitas.length > 0) conVisitas += 1;   // la semana abierta (una sola clase dictada) puede no tener visitas todavia
  if (v.matriz.celdas.some((c) => c.n === null)) conSuprimidas += 1;
  assert.ok(v.sin_identificar.total > 0 && v.sin_identificar.por_motivo.every((m) => m.etiqueta));
  const fechas = new Set(d.franjas.map((x) => x.fecha));
  assert.ok(v.visitas.every((x) => fechas.has(x.fecha)), `${semana}: ninguna visita de otra semana`);
}
assert.ok(conVisitas >= 2 && conSuprimidas >= 2, "el demo ejercita visitas y supresion en al menos 2 semanas");

console.log("RESUMEN: tests=visitas-calculo totales=cuadran supresion_n5=ok sin_nombres_en_matriz=ok cuadre_clase=ok demo_3_semanas=ok estado=verde");
