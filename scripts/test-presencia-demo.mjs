// Sanidad del fixture demo usado por la pestaña Presencia (TOC-91): confirma
// que lib/detalle-demo.mjs trae lo que lib/servidor/leerPresenciaClase.ts
// necesita (correo_norm, hora_inicio/hora_fin) y que, con los eventos
// sintéticos de lib/eventosPresenciaDemo.mjs, cada franja de las 2 semanas
// Detalle produce las 3 categorías (no solo una), para que la pestaña se vea
// representativa en capturas/demo.
import assert from "node:assert/strict";
import { DETALLE_DEMO_BASE } from "../lib/detalle-demo.mjs";
import { clasificar, construirBase, entroEnFecha } from "../lib/detalleCalculo.mjs";
import { clasificarPresencia } from "../lib/estadoPresencia.mjs";
import { eventosDemoParaPersona } from "../lib/eventosPresenciaDemo.mjs";
import { limitesFranjaMs } from "../lib/horarioFranja.mjs";

const conteosGlobales = { presente: 0, entro_y_salio: 0, nunca_entro: 0 };

for (const [semana, fixture] of Object.entries(DETALLE_DEMO_BASE)) {
  for (const persona of fixture.roster) {
    assert.match(persona.correo_norm, /^persona\.demo\.\d+@ejemplo\.test$/, `${semana}: correo sintético`);
  }
  for (const franja of fixture.franjas) {
    assert.ok(Number.isInteger(franja.hora_inicio), `${semana} ${franja.slot_id}: hora_inicio entera`);
    assert.equal(franja.hora_fin, franja.hora_inicio + 2, `${semana} ${franja.slot_id}: 2h por defecto`);
  }

  const base = construirBase(fixture.roster, fixture.franjas, fixture.sesiones, fixture.entradas, fixture.celdas);
  for (const franja of fixture.franjas) {
    const rosterFranja = fixture.roster.filter((p) => p.slot_id === franja.slot_id && clasificar(p, base) === "medible");
    if (rosterFranja.length === 0) continue; // franjas sin captura (sábado sin clase): nada que clasificar
    const { inicioMs, finMs } = limitesFranjaMs(franja.fecha, franja.hora_inicio, franja.hora_fin);
    for (const persona of rosterFranja) {
      if (!entroEnFecha(base, persona.persona_id, franja.fecha)) { conteosGlobales.nunca_entro += 1; continue; }
      const eventos = eventosDemoParaPersona(persona.persona_id, inicioMs, finMs);
      const resultado = clasificarPresencia(eventos, inicioMs, finMs);
      assert.notEqual(resultado.estado, "nunca_entro", "quien entró nunca debe salir nunca_entro con eventos sintéticos");
      conteosGlobales[resultado.estado] += 1;
    }
  }
}

assert.ok(conteosGlobales.presente > 0, "al menos un caso 'presente' en el demo");
assert.ok(conteosGlobales.entro_y_salio > 0, "al menos un caso 'entro_y_salio' en el demo");
assert.ok(conteosGlobales.nunca_entro > 0, "al menos un caso 'nunca_entro' en el demo");

console.log(`RESUMEN: tests=presencia-demo presente=${conteosGlobales.presente} ` +
  `entro_y_salio=${conteosGlobales.entro_y_salio} nunca_entro=${conteosGlobales.nunca_entro} estado=verde`);
