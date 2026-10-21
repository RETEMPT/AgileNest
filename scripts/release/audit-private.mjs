import { readFile, readdir, lstat } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createDecipheriv, createHash } from "node:crypto";
import { config } from "dotenv";
import postgres from "postgres";

const workspace = process.cwd();
const bundleIndex = process.argv.indexOf("--bundle");
if (bundleIndex >= 0 && !process.argv[bundleIndex + 1]) throw new Error("Pass a release bundle directory after --bundle.");
const root = bundleIndex < 0 ? workspace : path.resolve(process.argv[bundleIndex + 1] ?? "");
const known = new Map();
const findings = [];
const local = {};
for (const name of [".env.local", ".env"]) {
  try {
    const parsed = config({ path: path.join(workspace, name), quiet: true, processEnv: {} }).parsed ?? {};
    for (const [key, value] of Object.entries(parsed)) if (!(key in local)) local[key] = value;
  } catch { /* Missing optional environment files contain no secrets. */ }
}
function remember(value, kind) { if (typeof value === "string" && value.length >= 12) known.set(value, kind); }
for (const [name, value] of Object.entries(local)) if (/(?:SECRET|TOKEN|API_KEY|PASSWORD)$/.test(name)) remember(value, "local-environment-secret");
if (local.DATABASE_URL) {
  const password = decodeURIComponent(new URL(local.DATABASE_URL).password);
  if (password !== "agilecampus_dev") remember(password, "local-database-password");
}
const providerDirectory = path.resolve(local.AI_PROVIDER_STORE_DIR || ".data/ai-providers");
const pluginDirectory = path.resolve(local.AI_PLUGIN_STORE_DIR || ".data/ai-plugins");
const privateFiles = async (directory) => { try { return (await readdir(directory)).filter((name) => name.endsWith(".enc")); } catch (error) { if (error.code === "ENOENT") return []; throw error; } };
const providers = await privateFiles(providerDirectory);
const plugins = await privateFiles(pluginDirectory);
if (providers.length || plugins.length) {
  if (!local.DATABASE_URL || !(local.AUTH_SECRET || local.NEXTAUTH_SECRET)) throw new Error("Cannot audit private configuration without its local database and encryption secret.");
  const sql = postgres(local.DATABASE_URL, { max: 1, connect_timeout: 5, onnotice: () => {} });
  try {
    const actors = await sql`select id from users`;
    for (const actor of actors) for (const [directory, files, label, domain] of [[providerDirectory, providers, "providers", "agilenest:providers:v1\0"], [pluginDirectory, plugins, "plugins", "agilenest:plugins:v1\0"]]) {
      const name = `${createHash("sha256").update(actor.id).digest("hex")}.enc`;
      if (!files.includes(name)) continue;
      const bytes = await readFile(path.join(directory, name));
      const key = createHash("sha256").update(domain).update(local.AUTH_SECRET || local.NEXTAUTH_SECRET).digest();
      const decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12));
      decipher.setAuthTag(bytes.subarray(12, 28));
      decipher.setAAD(Buffer.from(`agilenest:${label}:${actor.id}`));
      const value = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8"));
      for (const entry of value.providers ?? []) remember(entry.apiKey, "local-provider-key");
      for (const entry of value.mcpServers ?? []) remember(entry.token, "local-mcp-token");
      for (const entry of [...value.providers ?? [], ...value.mcpServers ?? []]) {
        const address = entry.configuration?.baseUrl ?? entry.url;
        if (!address) continue;
        const hostname = new URL(address).hostname;
        if (!["api.openai.com", "api.anthropic.com", "api.deepseek.com"].includes(hostname)) remember(hostname, "local-provider-endpoint");
      }
    }
  } finally { await sql.end({ timeout: 2 }); }
}
async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error("Symbolic link found; audit the resolved package separately.");
    if (entry.isDirectory()) files.push(...await walk(target));
    else files.push(path.relative(root, target));
  }
  return files;
}
const files = bundleIndex < 0 ? execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean) : await walk(root);
const tokenPattern = /(?<![A-Za-z0-9_])(?:sk-(?:proj-|ant-)?[A-Za-z0-9_-]{24,}|gh[pousr]_[A-Za-z0-9_]{30,}|github_pat_[A-Za-z0-9_]{40,}|AKIA[A-Z0-9]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\\n]*[A-Za-z0-9+/=\\\r\n]{80,}[\s\\n]*-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)(?![A-Za-z0-9_])/g;
for (const file of files) {
  const normalized = file.replaceAll("\\", "/");
  const template = bundleIndex < 0 && [".env.example", ".env.test.example"].includes(normalized);
  if (!template && /(?:^|\/)(?:\.env(?:\.[^/]*)?|\.data|\.tmp|pgdata|\.git)(?:\/|$)/.test(normalized) || bundleIndex >= 0 && /^data\//.test(normalized) || normalized.endsWith(".enc")) findings.push({ kind: "private-file", file: normalized });
  const target = path.join(root, file);
  const stat = await lstat(target);
  if (!stat.isFile()) continue;
  const bytes = await readFile(target);
  const text = bytes.toString("utf8");
  for (const [value, kind] of known) if (text.includes(value)) findings.push({ kind, file: normalized, line: text.slice(0, text.indexOf(value)).split("\n").length });
  // Token heuristics apply to text; exact local private-value checks also cover binaries.
  if (!bytes.includes(0) && tokenPattern.test(text)) findings.push({ kind: "credential-pattern", file: normalized });
  tokenPattern.lastIndex = 0;
}
console.log(JSON.stringify({ scope: bundleIndex < 0 ? "publishable-source" : "release-bundle", files: files.length, localPrivateValuesChecked: known.size, findings }, null, 2));
if (process.argv.includes("--history")) {
  const objects = execFileSync("git", ["rev-list", "--objects", "HEAD", "--remotes=origin", "--tags"], { encoding: "utf8" }).trim().split("\n");
  const names = new Map(objects.map((line) => { const space = line.indexOf(" "); return space < 0 ? [line, ""] : [line.slice(0, space), line.slice(space + 1)]; }));
  const bytes = execFileSync("git", ["cat-file", "--batch"], { input: [...names.keys()].join("\n") + "\n", maxBuffer: 512 * 1024 * 1024 });
  let offset = 0;
  const history = [];
  while (offset < bytes.length) {
    const end = bytes.indexOf(10, offset);
    const [object, type, length] = bytes.subarray(offset, end).toString("ascii").split(" ");
    const size = Number(length);
    if (!Number.isSafeInteger(size)) throw new Error("Cannot read Git history object.");
    const content = bytes.subarray(end + 1, end + 1 + size);
    if (type === "blob") for (const [value, kind] of known) if (content.includes(Buffer.from(value))) history.push({ kind, object, file: names.get(object) });
    offset = end + size + 2;
  }
  console.log(JSON.stringify({ scope: "publishable-git-history", objects: names.size, findings: history }, null, 2));
  if (history.length) process.exitCode = 1;
}
if (findings.length) process.exitCode = 1;
