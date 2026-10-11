// Franjas hermanas (Samuel, sabado 2026-10-10): los grupos "uno" y "dos" de las 8:00 se mudaron a una sola sala. Quien entra a
// una sala del MISMO dia, la MISMA hora de inicio y el MISMO tipo (basico/avanzado) que su clase esta en su horario correcto,
// aunque la sala sea la de su grupo hermano. Otra hora u otro tipo sigue siendo "otra franja" (colado). Sin I/O.
// La usan En vivo, Lista en vivo, el calendario/CSV (detalleCalculo) y la poblacion del periodo.
const esAvanzada = (f) => /avanzad/i.test(`${f?.tipo ?? ""} ${f?.slot_id ?? ""}`);

// franja -> clave de horario (null si le falta fecha u hora: entonces solo es hermana de si misma)
export function claveHorario(f) {
  if (!f || !f.fecha || f.hora_inicio == null || f.hora_inicio === "") return null;
  return `${f.fecha}|${Number(f.hora_inicio)}|${esAvanzada(f) ? "A" : "B"}`;
}

// [{ slot_id, fecha, hora_inicio, tipo }] -> Map(id -> Set(id)) con las franjas hermanas de cada una (incluida ella).
// `id` = slot_id, o `${semana}|${slot_id}` si se pasa `conSemana` (para periodos de varias semanas).
export function hermanasPorSlot(franjas, conSemana = false) {
  const id = (f) => (conSemana ? `${f.semana}|${f.slot_id}` : f.slot_id);
  const porClave = new Map();
  for (const f of franjas) {
    const k = claveHorario(f);
    if (!k) continue;
    const kk = conSemana ? `${f.semana}|${k}` : k;
    if (!porClave.has(kk)) porClave.set(kk, new Set());
    porClave.get(kk).add(id(f));
  }
  const salida = new Map();
  for (const f of franjas) {
    const k = claveHorario(f);
    salida.set(id(f), k ? porClave.get(conSemana ? `${f.semana}|${k}` : k) : new Set([id(f)]));
  }
  return salida;
}

// ¿La clase `slotEntro` es el horario correcto de alguien cuyas franjas son `slotsPersona`?
export function esSuHorario(slotsPersona, slotEntro, hermanas) {
  if (!slotsPersona || slotEntro == null) return false;
  if (slotsPersona.has(slotEntro)) return true;
  const grupo = hermanas?.get(slotEntro);
  if (!grupo) return false;
  for (const s of slotsPersona) if (grupo.has(s)) return true;
  return false;
}
