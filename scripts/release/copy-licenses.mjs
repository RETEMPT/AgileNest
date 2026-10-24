import { readFile, readdir, mkdir, copyFile } from "node:fs/promises";
import path from "node:path";
const [workspace, bundle] = process.argv.slice(2);
const lock = JSON.parse(await readFile(path.join(workspace, "package-lock.json"), "utf8"));
for (const [relative, info] of Object.entries(lock.packages)) {
  if (!relative || info.dev) continue;
  const source = path.join(workspace, relative);
  let files;
  try { files = await readdir(source, { withFileTypes: true }); } catch (error) { if (error.code === "ENOENT") continue; throw error; }
  const licenseFiles = files.filter((entry) => entry.isFile() && /^(licen[sc]e|copying|notice)(\.|$)/i.test(entry.name));
  const target = path.join(bundle, "licenses/npm", relative.replace(/^node_modules[/\\]/, ""));
  for (const entry of licenseFiles) { await mkdir(target, { recursive: true }); await copyFile(path.join(source, entry.name), path.join(target, entry.name)); }
}
