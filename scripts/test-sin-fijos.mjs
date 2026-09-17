import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory()
        ? filesIn(resolve(directory, entry.name))
        : [resolve(directory, entry.name)],
    ),
  );
  return nested.flat();
}
const files = [
  ...(await filesIn(resolve(root, "components"))),
  ...(await filesIn(resolve(root, "app"))).filter((file) =>
    /\.(tsx|ts|mjs)$/.test(file),
  ),
];
const forbidden = ["208", "12 sesiones", "ZOOM-LIMIT (N)", "roster*5"];
const hits = [];
for (const file of files) {
  const text = await readFile(file, "utf8");
  for (const term of forbidden)
    if (text.includes(term)) hits.push(`${file}:${term}`);
}
if (hits.length) {
  console.error(hits.join("\n"));
  process.exit(1);
}
console.log("RESUMEN: tests=1 estado=verde sin_fijos=0");
