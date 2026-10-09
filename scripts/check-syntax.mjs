import {readdir, readFile, mkdtemp, writeFile, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';

const skip = new Set(['.git', 'node_modules', 'test-results', 'playwright-report', 'blob-report', '.venv']);
const scratch = await mkdtemp(join(tmpdir(), 'zero-syntax-'));
let checked = 0;
let errors = 0;

const check = (file, label = file) => {
  const result = spawnSync(process.execPath, ['--check', file], {encoding: 'utf8'});
  checked += 1;
  if (result.status !== 0) { console.error(label, result.stderr); errors += 1; }
};

async function walk(directory) {
  for (const entry of await readdir(directory, {withFileTypes: true})) {
    if (skip.has(entry.name)) continue;
    const file = join(directory, entry.name);
    if (entry.isDirectory()) await walk(file);
    else if (/\.(?:js|mjs|cjs)$/.test(entry.name)) check(file);
    else if (entry.name.endsWith('.html')) {
      const html = await readFile(file, 'utf8');
      const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
      for (const [index, script] of scripts.entries()) {
        if (!script[2].trim() || /\btype=["']application\/ld\+json["']/i.test(script[1])) continue;
        const extracted = join(scratch, `${checked}-${index}.js`);
        await writeFile(extracted, script[2]);
        check(extracted, `${file} (inline script ${index + 1})`);
      }
    }
  }
}

try {
  await walk(process.cwd());
  console.log(`${checked} JavaScript files / inline scripts checked; ${errors} errors.`);
  process.exitCode = errors ? 1 : 0;
} finally {
  await rm(scratch, {recursive: true, force: true});
}
