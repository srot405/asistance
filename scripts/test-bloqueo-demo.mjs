process.env.MODO_DEMO = "1";
process.env.VERCEL_ENV = "production";
try {
  await import("../lib/demo.js");
  throw new Error("no bloqueó");
} catch (e) {
  if (!String(e.message).includes("bloqueado")) throw e;
  console.log("OK demo bloqueado en producción");
}
console.log("RESUMEN: tests=1 estado=verde");
