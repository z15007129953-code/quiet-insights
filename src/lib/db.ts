import postgres, { type Sql } from 'postgres';

const clients = new Map<boolean, Sql>();
const initialized = new WeakMap<object, Promise<void>>();

export function databaseUrl(test = false): string {
  const value = test ? process.env.TEST_DATABASE_URL : process.env.DATABASE_URL;
  if (!value) throw new Error('DATABASE_URL is not configured. Run the local database setup first.');
  return value;
}

export function sql(test = false): Sql {
  let client = clients.get(test);
  if (!client) { client = postgres(databaseUrl(test), { max: 5, idle_timeout: 20, connect_timeout: 5 }); clients.set(test, client); }
  return client;
}

export async function ensureSchema(db = sql()): Promise<void> {
  if (!initialized.has(db as object)) {
    initialized.set(db as object, (async () => {
      await db.unsafe(`
        CREATE TABLE IF NOT EXISTS workspaces (
          id text PRIMARY KEY, cookie_hash text NOT NULL UNIQUE,
          created_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS applications (
          id text PRIMARY KEY, workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
          name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80), retention_days integer NOT NULL DEFAULT 30 CHECK (retention_days IN (7,30,90)),
          created_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS applications_workspace_idx ON applications(workspace_id);
        CREATE TABLE IF NOT EXISTS ingestion_keys (
          id text PRIMARY KEY, app_id text NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
          environment text NOT NULL CHECK (environment IN ('production','development')), key_hash text NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz
        );
        CREATE INDEX IF NOT EXISTS keys_active_idx ON ingestion_keys(app_id, environment) WHERE revoked_at IS NULL;
        CREATE TABLE IF NOT EXISTS batches (
          app_id text NOT NULL REFERENCES applications(id) ON DELETE CASCADE, environment text NOT NULL,
          batch_id text NOT NULL, payload_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (app_id, environment, batch_id)
        );
        CREATE TABLE IF NOT EXISTS events (
          id bigserial PRIMARY KEY, app_id text NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
          environment text NOT NULL, batch_id text NOT NULL, event_index integer NOT NULL,
          name text NOT NULL, timestamp timestamptz NOT NULL, device_id text NOT NULL, session_id text NOT NULL,
          version text NOT NULL, os text NOT NULL, country text NOT NULL, properties jsonb NOT NULL DEFAULT '{}'::jsonb,
          UNIQUE(app_id, environment, batch_id, event_index)
        );
        CREATE INDEX IF NOT EXISTS events_filter_idx ON events(app_id, environment, timestamp DESC);
        CREATE TABLE IF NOT EXISTS funnels (
          id text PRIMARY KEY, app_id text NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
          name text NOT NULL, steps jsonb NOT NULL, window_hours integer NOT NULL CHECK (window_hours BETWEEN 1 AND 168),
          created_at timestamptz NOT NULL DEFAULT now()
        );
        UPDATE events SET properties = (properties #>> '{}')::jsonb WHERE jsonb_typeof(properties) = 'string';
        UPDATE funnels SET steps = (steps #>> '{}')::jsonb WHERE jsonb_typeof(steps) = 'string';
      `);
    })());
  }
  return initialized.get(db as object);
}

export async function closeDatabase(): Promise<void> {
  for (const client of clients.values()) await client.end({ timeout: 2 });
  clients.clear();
}
