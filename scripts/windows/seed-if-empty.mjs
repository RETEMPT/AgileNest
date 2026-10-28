import 'dotenv/config';
import postgres from 'postgres';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const sql = postgres(process.env.DATABASE_URL, { max: 1 });
let empty;
try {
  empty = (await sql`SELECT 1 FROM users LIMIT 1`).length === 0;
} finally {
  await sql.end();
}
if (empty) {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../seed.mjs', import.meta.url))], { stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} else {
  console.log('Existing users found; demo data was not changed.');
}
