import { sql, ensureSchema } from '../src/lib/db.ts';

const db = sql();
await ensureSchema(db);
await db`DELETE FROM events e USING applications a WHERE e.app_id = a.id AND e.timestamp < now() - (a.retention_days || ' days')::interval`;
console.log('Quiet Insights expired events removed.');
await db.end({ timeout: 2 });
