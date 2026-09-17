import { readFile } from "node:fs/promises";
const d = JSON.parse(
  await readFile(
    new URL("../data/demo/semana-2026-09-14.json", import.meta.url),
  ),
);
const count = Object.fromEntries(
  Object.entries(
    d.celdas_dia.reduce(
      (a, c) => ((a[c.estado] = (a[c.estado] || 0) + 1), a),
      {},
    ),
  ),
);
for (const [k, v] of Object.entries({
  roster: 726,
  franjas: 14,
  V: 63,
  A: 2,
  N: 3,
  "R?": 40,
  P: 621,
  "-": 2901,
  SI: 66,
  "NO?": 40,
})) {
  const got =
    k === "roster"
      ? d.roster.length
      : k === "franjas"
        ? d.franjas.length
        : ["SI", "NO?"].includes(k)
          ? d.celdas_semana.filter((x) => x.estado === k).length
          : count[k];
  if (got !== v) throw new Error(`${k}: ${got}`);
}
for (const fecha of [...new Set(d.celdas_dia.map((x) => x.fecha))])
  if (d.celdas_dia.filter((x) => x.fecha === fecha).length !== 726)
    throw new Error(`fecha ${fecha}`);
console.log("RESUMEN: demo=verde roster=726 franjas=14 fechas=5");
