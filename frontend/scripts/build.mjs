// Angular 22 enables its chunk-optimization pass by default. That pass merges
// every initial vendor chunk into `main`, so the repository's per-script
// bundle budgets would stop measuring the same thing (and `main` would exceed
// the 500 kB error budget without any real growth in transferred bytes).
// Keep the prior split-chunk layout by disabling only that new optimization.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ngCli = require.resolve('@angular/cli/bin/ng.js');

process.env.NG_BUILD_OPTIMIZE_CHUNKS ??= '0';

const result = spawnSync(process.execPath, [ngCli, 'build', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env,
});

process.exit(result.status ?? 1);
