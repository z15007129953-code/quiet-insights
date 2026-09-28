import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const local = path.join(root, '.local');
const bin = process.env.QUIET_POSTGRES_BIN;
const mode = process.argv[2];
const clusters = [{ name: 'development', port: 54351, database: 'quiet_insights' }, { name: 'test', port: 54352, database: 'quiet_insights_test' }];
const run = (command, args, env = process.env) => { const result = spawnSync(path.join(bin, command), args, { cwd: root, encoding: 'utf8', env: { ...env, LC_ALL: 'C' } }); if (result.status !== 0) throw new Error(`${command} failed`); return result.stdout; };
const dataPath = (cluster) => path.join(local, `postgres-${cluster.name}`);
const markerPath = (cluster) => path.join(dataPath(cluster), 'quiet-insights-cluster.json');
function validate(cluster) { const data = dataPath(cluster); const marker = JSON.parse(readFileSync(markerPath(cluster), 'utf8')); if (marker.database !== cluster.database || marker.port !== cluster.port || (marker.data && marker.data !== data) || readFileSync(path.join(data, 'PG_VERSION'), 'utf8').trim() !== '17') throw new Error('Cluster identity mismatch'); return data; }
function start(cluster) { const data = validate(cluster); if (spawnSync(path.join(bin, 'pg_ctl'), ['-D', data, 'status'], { stdio: 'ignore' }).status === 0) return; run('pg_ctl', ['-D', data, '-l', path.join(local, `${cluster.name}.log`), '-o', `-h 127.0.0.1 -p ${cluster.port} -k ''`, '-w', 'start']); }
if (!bin || !path.isAbsolute(bin) || !existsSync(path.join(bin, 'pg_ctl'))) throw new Error('Set QUIET_POSTGRES_BIN to an absolute PostgreSQL 17 bin directory');
if (!['init', 'start', 'stop'].includes(mode)) throw new Error('Usage: node scripts/local-db.mjs init|start|stop');
for (const key of ['PGHOST', 'PGHOSTADDR', 'PGPORT', 'PGDATABASE', 'PGSERVICE', 'PGSERVICEFILE', 'PGOPTIONS', 'PGUSER', 'PGUSERNAME', 'PGPASSWORD']) if (process.env[key]) throw new Error('Remove inherited PostgreSQL connection overrides');
if (mode === 'init') {
  if (existsSync(path.join(root, '.env.local')) || clusters.some((cluster) => existsSync(dataPath(cluster)))) throw new Error('Existing Quiet Insights database/configuration found');
  if (!run('postgres', ['--version']).includes(' 17.')) throw new Error('PostgreSQL 17 is required');
  mkdirSync(local, { recursive: true, mode: 0o700 });
  const password = randomBytes(32).toString('hex');
  const passwordFile = path.join(local, 'initial-password');
  writeFileSync(passwordFile, password, { mode: 0o600, flag: 'wx' });
  try {
    for (const cluster of clusters) {
      const data = dataPath(cluster);
      run('initdb', ['-D', data, '-U', 'quiet_local', '--auth=scram-sha-256', '--encoding=UTF8', '--locale=C', `--pwfile=${passwordFile}`]);
      writeFileSync(markerPath(cluster), JSON.stringify({ database: cluster.database, port: cluster.port, data }), { mode: 0o600, flag: 'wx' });
      start(cluster);
      run('createdb', ['-h', '127.0.0.1', '-p', String(cluster.port), '-U', 'quiet_local', cluster.database], { ...process.env, PGPASSWORD: password });
    }
    writeFileSync(path.join(root, '.env.local'), clusters.map((cluster) => `${cluster.name === 'test' ? 'TEST_DATABASE_URL' : 'DATABASE_URL'}=postgresql://quiet_local:${password}@127.0.0.1:${cluster.port}/${cluster.database}`).join('\n') + '\n', { mode: 0o600, flag: 'wx' });
  } finally { unlinkSync(passwordFile); }
} else if (mode === 'start') clusters.forEach(start);
else clusters.forEach((cluster) => { const data = validate(cluster); if (spawnSync(path.join(bin, 'pg_ctl'), ['-D', data, 'status'], { stdio: 'ignore' }).status === 0) run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']); });
console.log(`Quiet Insights local database ${mode} completed.`);
