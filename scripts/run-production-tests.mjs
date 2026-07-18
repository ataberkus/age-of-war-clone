import { spawnSync } from 'node:child_process';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, '.test-dist');
const tsc = join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'tsc.cmd' : 'tsc');

let exitCode = 1;
try {
  rmSync(output, { recursive: true, force: true });
  if (!existsSync(tsc)) {
    console.error('TypeScript compiler not found. Run npm install first.');
    process.exitCode = 1;
  } else {
    const compile = spawnSync(tsc, ['-p', 'tsconfig.tests.json'], {
      cwd: root,
      stdio: 'inherit',
    });
    if (compile.status !== 0) {
      exitCode = compile.status ?? 1;
    } else {
      writeFileSync(join(output, 'package.json'), '{"type":"commonjs"}\n');
      const tests = spawnSync(process.execPath, [
        '--test',
        'tests/production-engine.test.cjs',
        'tests/sync.test.cjs',
      ], {
        cwd: root,
        stdio: 'inherit',
      });
      exitCode = tests.status ?? 1;
    }
  }
} finally {
  rmSync(output, { recursive: true, force: true });
}

process.exitCode = exitCode;
