import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { closeDatabase, ensureSchema, sql } from '../src/lib/db.ts';
import { authenticateKey, createApplication, ingest, ingestWithKey, analytics, rotateKey, workspaceForCookie } from '../src/lib/repository.ts';

const event = { name: 'opened', timestamp: new Date().toISOString(), deviceId: 'db-device', sessionId: 'db-session', version: '1.0', os: 'iOS', country: 'CN', properties: { plan: 'free' } };

test('isolates workspaces and makes retries idempotent while rotating keys', async (t) => {
  t.after(closeDatabase);
  const db = sql(true);
  await ensureSchema(db);
  const first = await workspaceForCookie(`test-${randomUUID()}`, db);
  const second = await workspaceForCookie(`test-${randomUUID()}`, db);
  const created = await createApplication(first.id, 'Database test', db);
  assert.equal((await authenticateKey(created.keys.production, db))?.appId, created.app.id);
  const batch = { batchId: `batch-${randomUUID()}`, events: [event] };
  assert.deepEqual(await ingest(created.app.id, 'production', batch, 30, db), { inserted: 1, duplicate: false });
  assert.deepEqual(await ingest(created.app.id, 'production', batch, 30, db), { inserted: 0, duplicate: true });
  await assert.rejects(() => ingest(created.app.id, 'production', { ...batch, events: [{ ...event, name: 'changed' }] }, 30, db), /different payload/);
  const rotated = await rotateKey(first.id, created.app.id, 'production', db);
  assert.equal(await authenticateKey(created.keys.production, db), null);
  assert.equal((await authenticateKey(rotated.key, db))?.appId, created.app.id);
  assert.equal((await (await import('../src/lib/repository.ts')).appsForWorkspace(second.id, db)).length, 0);
  const retry = { batchId: `concurrent-${randomUUID()}`, events: [{ ...event, version: '2.0' }] };
  const results = await Promise.all(Array.from({ length: 6 }, () => ingestWithKey(rotated.key, retry, db)));
  assert.equal(results.filter(result => !result.duplicate).length, 1);
  const filtered = await analytics({ appId: created.app.id, environment: 'production', days: 7, version: '1.0' }, db);
  assert.equal(filtered.total, 1);
  assert.deepEqual(filtered.versions, ['1.0', '2.0']);
  assert.equal(filtered.trend.length, 7);
  assert.equal(filtered.trend.reduce((sum, day) => sum + day.count, 0), filtered.total);
  const keys = await Promise.all(Array.from({ length: 8 }, () => rotateKey(first.id, created.app.id, 'production', db)));
  const active = await Promise.all(keys.map(result => authenticateKey(result.key, db)));
  assert.equal(active.filter(Boolean).length, 1, 'Concurrent rotations leave only one active key');
  await closeDatabase();
});
