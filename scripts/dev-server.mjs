// Session-local launcher for the existing macOS preview service. No login daemon is installed.
import { fileURLToPath } from 'node:url';
process.chdir(fileURLToPath(new URL('../', import.meta.url)));
process.env.ASTRO_TELEMETRY_DISABLED = '1';
const cli = new URL('../node_modules/astro/bin/astro.mjs', import.meta.url);
process.argv = [process.execPath, fileURLToPath(cli), 'dev', '--ignore-lock', '--host', '127.0.0.1', '--port', process.env.PORT || '4317'];
await import(cli.href);
