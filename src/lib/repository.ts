import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Sql } from 'postgres';
import { batchSchema, funnel as calculateFunnel, summarize, type Batch, type Event } from './domain.ts';
import { ensureSchema, sql as defaultSql } from './db.ts';

export type Environment = 'production' | 'development';
export type Workspace = { id: string; cookieHash: string };
export type App = { id: string; name: string; retention: number };

export function hashSecret(secret: string): string { return createHash('sha256').update(secret).digest('hex'); }
export function newSecret(prefix = 'qi'): string { return `${prefix}_${randomBytes(24).toString('base64url')}`; }

export async function workspaceForCookie(cookieHash: string, db: Sql = defaultSql()): Promise<Workspace> {
  await ensureSchema(db);
  const [workspace] = await db<Workspace[]>`SELECT id, cookie_hash AS "cookieHash" FROM workspaces WHERE cookie_hash = ${cookieHash}`;
  if (workspace) return workspace;
  const [created] = await db<Workspace[]>`INSERT INTO workspaces(id,cookie_hash) VALUES (${randomUUID()},${cookieHash}) RETURNING id, cookie_hash AS "cookieHash"`;
  return created;
}

export async function appsForWorkspace(workspaceId: string, db: Sql = defaultSql()): Promise<App[]> {
  await ensureSchema(db);
  return db<App[]>`SELECT id, name, retention_days AS retention FROM applications WHERE workspace_id = ${workspaceId} ORDER BY created_at`;
}

export async function applicationForWorkspace(workspaceId: string, appId: string, db: Sql = defaultSql()): Promise<App | null> {
  await ensureSchema(db);
  const [app] = await db<App[]>`SELECT id,name,retention_days AS retention FROM applications WHERE id=${appId} AND workspace_id=${workspaceId}`;
  return app ?? null;
}

export async function createApplication(workspaceId: string, name: string, db: Sql = defaultSql()): Promise<{ app: App; keys: Record<Environment, string> }> {
  await ensureSchema(db);
  const values: Record<Environment, string> = { production: newSecret(), development: newSecret() };
  const app = await db.begin(async (tx) => {
    const [created] = await tx<App[]>`INSERT INTO applications(id,workspace_id,name) VALUES (${randomUUID()},${workspaceId},${name.trim()}) RETURNING id,name,retention_days AS retention`;
    for (const environment of ['production', 'development'] as Environment[]) {
      await tx`INSERT INTO ingestion_keys(id,app_id,environment,key_hash) VALUES (${randomUUID()},${created.id},${environment},${hashSecret(values[environment])})`;
    }
    return created;
  });
  return { app, keys: values };
}

export async function rotateKey(workspaceId: string, appId: string, environment: Environment, db: Sql = defaultSql()): Promise<{ app: App; key: string }> {
  const key = newSecret();
  const app = await db.begin(async (tx) => {
    const [owned] = await tx<App[]>`SELECT id,name,retention_days AS retention FROM applications WHERE id=${appId} AND workspace_id=${workspaceId} FOR UPDATE`;
    if (!owned) throw new Error('Application not found');
    await tx`UPDATE ingestion_keys SET revoked_at = now() WHERE app_id = ${appId} AND environment = ${environment} AND revoked_at IS NULL`;
    await tx`INSERT INTO ingestion_keys(id,app_id,environment,key_hash) VALUES (${randomUUID()},${appId},${environment},${hashSecret(key)})`;
    return owned;
  });
  return { app, key };
}

export async function saveFunnel(workspaceId: string, appId: string, name: string, steps: string[], windowHours: number, db: Sql = defaultSql()) {
  const [app] = await db<App[]>`SELECT id,name,retention_days AS retention FROM applications WHERE id = ${appId} AND workspace_id = ${workspaceId}`;
  if (!app) throw new Error('Application not found');
  const [result] = await db<{ id: string; name: string; steps: string[]; windowHours: number }[]>`
    INSERT INTO funnels(id,app_id,name,steps,window_hours) VALUES (${randomUUID()},${appId},${name.trim()},${db.json(steps)},${windowHours})
    RETURNING id,name,steps,window_hours AS "windowHours"`;
  return result;
}

export async function funnelByName(workspaceId: string, appId: string, name: string, db: Sql = defaultSql()) {
  const [result] = await db<{ id: string; name: string; steps: string[]; windowHours: number }[]>`
    SELECT f.id, f.name, f.steps, f.window_hours AS "windowHours"
    FROM funnels f
    JOIN applications a ON a.id = f.app_id
    WHERE f.app_id = ${appId} AND a.workspace_id = ${workspaceId} AND f.name = ${name}
    ORDER BY f.created_at
    LIMIT 1`;
  return result ?? null;
}

export async function updateRetention(workspaceId: string, appId: string, days: 7 | 30 | 90, db: Sql = defaultSql()): Promise<App> {
  const [app] = await db<App[]>`UPDATE applications SET retention_days = ${days} WHERE id = ${appId} AND workspace_id = ${workspaceId} RETURNING id,name,retention_days AS retention`;
  if (!app) throw new Error('Application not found');
  await purgeExpired(appId, days, db);
  return app;
}

export async function authenticateKey(key: string, db: Sql = defaultSql()): Promise<{ appId: string; environment: Environment; retention: number } | null> {
  await ensureSchema(db);
  const [row] = await db<{ appId: string; environment: Environment; retention: number }[]>`
    SELECT k.app_id AS "appId", k.environment, a.retention_days AS retention
    FROM ingestion_keys k JOIN applications a ON a.id = k.app_id
    WHERE k.key_hash = ${hashSecret(key)} AND k.revoked_at IS NULL`;
  return row ?? null;
}

export async function ingest(appId: string, environment: Environment, input: unknown, retentionDays: number, db: Sql = defaultSql()): Promise<{ inserted: number; duplicate: boolean }> {
  const parsed = batchSchema.safeParse(input);
  if (!parsed.success) throw new Error('Invalid event batch');
  const batch: Batch = parsed.data;
  const latestAllowed = Date.now() + 5 * 60 * 1000;
  if (batch.events.some((event) => Date.parse(event.timestamp) > latestAllowed)) throw new Error('Event timestamp cannot be in the future');
  const payloadHash = hashSecret(JSON.stringify(batch));
  await ensureSchema(db);
  return db.begin(async (tx) => {
    const insertedBatch = await tx<{ batchId: string }[]>`INSERT INTO batches(app_id,environment,batch_id,payload_hash) VALUES (${appId},${environment},${batch.batchId},${payloadHash}) ON CONFLICT (app_id,environment,batch_id) DO NOTHING RETURNING batch_id AS "batchId"`;
    if (insertedBatch.length === 0) {
      const [existing] = await tx<{ payloadHash: string }[]>`SELECT payload_hash AS "payloadHash" FROM batches WHERE app_id=${appId} AND environment=${environment} AND batch_id=${batch.batchId}`;
      if (existing?.payloadHash !== payloadHash) throw new Error('Batch ID was already used with a different payload');
      return { inserted: 0, duplicate: true };
    }
    for (const [index, event] of batch.events.entries()) {
      await tx`INSERT INTO events(app_id,environment,batch_id,event_index,name,timestamp,device_id,session_id,version,os,country,properties)
        VALUES (${appId},${environment},${batch.batchId},${index},${event.name},${event.timestamp},${event.deviceId},${event.sessionId},${event.version},${event.os},${event.country},${tx.json(event.properties)})`;
    }
    await tx`DELETE FROM events WHERE app_id=${appId} AND timestamp < now() - (${retentionDays} || ' days')::interval`;
    return { inserted: batch.events.length, duplicate: false };
  });
}

export async function ingestWithKey(key: string, input: unknown, db: Sql = defaultSql()): Promise<{ inserted: number; duplicate: boolean }> {
  const parsed = batchSchema.safeParse(input);
  if (!parsed.success) throw new Error('Invalid event batch');
  const batch = parsed.data;
  const latestAllowed = Date.now() + 5 * 60 * 1000;
  if (batch.events.some((event) => Date.parse(event.timestamp) > latestAllowed)) throw new Error('Event timestamp cannot be in the future');
  await ensureSchema(db);
  return db.begin(async (tx) => {
    const [identity] = await tx<{ appId: string; environment: Environment; retention: number }[]>`
      SELECT k.app_id AS "appId", k.environment, a.retention_days AS retention
      FROM ingestion_keys k JOIN applications a ON a.id=k.app_id
      WHERE k.key_hash=${hashSecret(key)} AND k.revoked_at IS NULL FOR SHARE`;
    if (!identity) throw new Error('Invalid or revoked ingestion key');
    const payloadHash = hashSecret(JSON.stringify(batch));
    const insertedBatch = await tx<{ batchId: string }[]>`INSERT INTO batches(app_id,environment,batch_id,payload_hash) VALUES (${identity.appId},${identity.environment},${batch.batchId},${payloadHash}) ON CONFLICT (app_id,environment,batch_id) DO NOTHING RETURNING batch_id AS "batchId"`;
    if (!insertedBatch.length) {
      const [existing] = await tx<{ payloadHash: string }[]>`SELECT payload_hash AS "payloadHash" FROM batches WHERE app_id=${identity.appId} AND environment=${identity.environment} AND batch_id=${batch.batchId}`;
      if (existing?.payloadHash !== payloadHash) throw new Error('Batch ID was already used with a different payload');
      return { inserted: 0, duplicate: true };
    }
    for (const [index, event] of batch.events.entries()) await tx`INSERT INTO events(app_id,environment,batch_id,event_index,name,timestamp,device_id,session_id,version,os,country,properties) VALUES (${identity.appId},${identity.environment},${batch.batchId},${index},${event.name},${event.timestamp},${event.deviceId},${event.sessionId},${event.version},${event.os},${event.country},${tx.json(event.properties)})`;
    await tx`DELETE FROM events WHERE app_id=${identity.appId} AND timestamp < now() - (${identity.retention} || ' days')::interval`;
    return { inserted: batch.events.length, duplicate: false };
  });
}

export async function purgeExpired(appId: string, days: number, db: Sql = defaultSql()): Promise<void> {
  await db`DELETE FROM events WHERE app_id=${appId} AND timestamp < now() - (${days} || ' days')::interval`;
}

export type AnalyticsFilters = { appId: string; environment: Environment; days: number; version?: string; propertyKey?: string; propertyValue?: string };
export async function analytics(filters: AnalyticsFilters, db: Sql = defaultSql()) {
  await ensureSchema(db);
  const start = new Date(); start.setUTCHours(0, 0, 0, 0); start.setUTCDate(start.getUTCDate() - (filters.days - 1));
  const since = start.toISOString();
  const clauses = ['e.app_id = $1', 'e.environment = $2', 'e.timestamp >= $3', "e.timestamp <= now()", "e.timestamp >= now() - (a.retention_days || ' days')::interval"];
  const values: unknown[] = [filters.appId, filters.environment, since];
  if (filters.version) { clauses.push(`version = $${values.length + 1}`); values.push(filters.version); }
  if (filters.propertyKey && filters.propertyValue && ['screen', 'plan', 'source', 'feature', 'result'].includes(filters.propertyKey)) { clauses.push(`properties ->> $${values.length + 1} = $${values.length + 2}`); values.push(filters.propertyKey, filters.propertyValue); }
  const rows = await db.unsafe<Event[]>(`SELECT e.name,e.timestamp,e.device_id AS "deviceId",e.session_id AS "sessionId",e.version,e.os,e.country,e.properties FROM events e JOIN applications a ON a.id=e.app_id WHERE ${clauses.join(' AND ')} ORDER BY e.timestamp DESC LIMIT 50001`, values as never[]);
  const partial = rows.length > 50000;
  const events = rows.slice(0, 50000).map((event) => ({ ...event, timestamp: new Date(event.timestamp as unknown as string | Date).toISOString() }));
  const summary = summarize(events);
  const trendMap = new Map(summary.trend.map((item) => [item.date, item.count]));
  const trend: Array<{ date: string; count: number }> = [];
  for (let offset = filters.days - 1; offset >= 0; offset -= 1) {
    const date = new Date(start.getTime() + (filters.days - 1 - offset) * 86_400_000).toISOString().slice(0, 10);
    trend.push({ date, count: trendMap.get(date) ?? 0 });
  }
  const [funnelRows, versionRows] = await Promise.all([
    db<{ id: string; name: string; steps: string[]; windowHours: number }[]>`SELECT id,name,steps,window_hours AS "windowHours" FROM funnels WHERE app_id=${filters.appId} ORDER BY created_at`,
    db<{ version: string }[]>`SELECT DISTINCT version FROM events e JOIN applications a ON a.id=e.app_id WHERE e.app_id=${filters.appId} AND e.environment=${filters.environment} AND e.timestamp >= ${since} AND e.timestamp <= now() AND e.timestamp >= now() - (a.retention_days || ' days')::interval ORDER BY version`,
  ]);
  const funnels = funnelRows.map((item) => ({ ...item, counts: calculateFunnel(events, item.steps, item.windowHours) }));
  const versions = versionRows.map((row) => row.version);
  return { ...summary, trend, recent: events.slice(0, 100), funnels, versions, partial };
}

export async function exportRows(filters: AnalyticsFilters, db: Sql = defaultSql()) {
  const data = await analytics(filters, db);
  const rows: unknown[][] = [['event', 'count']];
  for (const item of data.ranking) rows.push([item.name, item.count]);
  return rows;
}
