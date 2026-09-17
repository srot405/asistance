import { usuarioAutorizado } from "../lib/auth.config.js";
const base = {
  email_confirmed_at: "ok",
  app_metadata: { provider: "google" },
  user_metadata: { custom_claims: { hd: "tocaunavida.org" } },
};
const cases = [
  ["válido", { ...base, email: "x@tocaunavida.org" }, true],
  ["subdominio", { ...base, email: "x@sub.tocaunavida.org" }, false],
  ["evil", { ...base, email: "x@tocaunavida.org.evil.com" }, false],
  ["mayúsculas", { ...base, email: "X@TOCAUNAVIDA.ORG" }, true],
  [
    "hd distinto",
    {
      ...base,
      email: "x@tocaunavida.org",
      user_metadata: { custom_claims: { hd: "otro.org" } },
    },
    false,
  ],
  [
    "sin confirmado",
    { ...base, email: "x@tocaunavida.org", email_confirmed_at: null },
    false,
  ],
];
for (const [name, user, want] of cases) {
  if (usuarioAutorizado(user) !== want) throw new Error(name);
  console.log(`OK ${name}`);
}
console.log("RESUMEN: tests=6 estado=verde");
