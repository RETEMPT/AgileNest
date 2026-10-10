import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  // .tools holds the local PostgreSQL/Node release runtimes; linting them exhausts the heap.
  globalIgnores([".next/**", "out/**", "build/**", "coverage/**", ".tools/**", "next-env.d.ts"]),
]);
