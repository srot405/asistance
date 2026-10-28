import { colorPermanencia, ingresoClase, textoIngreso, resumirPermanencia } from "./permanencia.mjs";

// Se puede ejecutar con Node sin framework o en V8 con este módulo y su dependencia.
export function probarPermanencia() {
  let comprobaciones = 0;
  function igual(actual, esperado) {
    comprobaciones++;
    if (JSON.stringify(actual) !== JSON.stringify(esperado)) throw new Error(`Esperado ${JSON.stringify(esperado)}, obtenido ${JSON.stringify(actual)}`);
  }
  for (const [pct, color] of [[0,"rojo"], [59.99,"rojo"], [60,"amarillo"], [79.99,"amarillo"],
    [80,"verde"], [100,"verde"], [null,"sin_dato"], [undefined,"sin_dato"], [NaN,"sin_dato"],
    [Infinity,"sin_dato"], [-1,"sin_dato"], [101,"sin_dato"], ["60","sin_dato"]]) igual(colorPermanencia(pct), color);
  igual(textoIngreso(true), "Sí"); igual(textoIngreso(false), "No"); igual(textoIngreso(null), "Sin dato");
  // Medio segundo/7200 segundos se ve 0.0 %: sigue siendo Sí y rojo.
  igual(textoIngreso(ingresoClase(true, false, false)), "Sí");
  igual(ingresoClase(false, true, false), true); // API sin webhook, aun con tiempo 0
  igual(ingresoClase(false, false, true), false);
  igual(ingresoClase(false, false, false), null);
  const medioSegundo = 0.5 / 7200 * 100;
  igual(resumirPermanencia([{ingreso:ingresoClase(true,false,true),pct:medioSegundo}]), {
    ingreso:{si:1,no:0,sin_dato:0}, permanencia:{rojo:1,amarillo:0,verde:0,sin_dato:0}});
  for (const pct of [0, 59.99, 60, 79.99, 80, 100, null]) {
    igual(resumirPermanencia([{ingreso:ingresoClase(true,false,true),pct}]).ingreso.si, 1);
  }
  igual(resumirPermanencia([{ingreso:true,pct:0}, {ingreso:true,pct:60}, {ingreso:true,pct:80},
    {ingreso:true,pct:null}, {ingreso:false,pct:100}, {ingreso:null,pct:100}]), {
      ingreso:{si:4,no:1,sin_dato:1}, permanencia:{rojo:1,amarillo:1,verde:1,sin_dato:1}});
  return { comprobaciones, estado: "OK" };
}
