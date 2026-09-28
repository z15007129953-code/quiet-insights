import { ensureSchema } from '../src/lib/db.ts';

await ensureSchema();
console.log('Quiet Insights schema is ready.');
