import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
const root = process.cwd();
let drive,
  owned = false;
try {
  drive = ['T:', 'U:', 'V:', 'W:', 'X:', 'Y:', 'Z:'].find((d) => !existsSync(d + '\\'));
  if (!drive) throw new Error('No temporary build drive available');
  execFileSync('subst.exe', [drive, root]);
  owned = true;
  const env = {
    ...process.env,
    Path: 'C:/Program Files/Git/bin;C:/Program Files/Git/usr/bin;' + process.env.Path,
    TAR_OPTIONS: '--force-local',
  };
  const r = spawnSync(
    process.execPath,
    [
      'C:/Users/shang/.codex/plugins/cache/openai-curated-remote/sites/1.0.2-remix-a.1/scripts/site-workflow.mjs',
      ...process.argv.slice(2),
    ],
    { cwd: drive + '\\', stdio: 'inherit', env },
  );
  if (r.error) throw r.error;
  process.exitCode = r.status ?? 1;
} finally {
  if (owned) execFileSync('subst.exe', [drive, '/D']);
}
