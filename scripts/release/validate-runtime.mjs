import { createRequire } from "node:module";
import path from "node:path";
const require = createRequire(path.resolve(import.meta.dirname, "../app/package.json"));
const modulesPath = path.resolve(import.meta.dirname, "../app/node_modules") + path.sep;
for (const name of ["postgres", "bcryptjs"]) {
  if (!require.resolve(name).startsWith(modulesPath)) throw new Error(`${name} is not bundled locally`);
  require(name);
}
