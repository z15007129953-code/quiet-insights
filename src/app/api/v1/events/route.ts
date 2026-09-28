import { NextResponse } from 'next/server';
import { ingestWithKey } from '../../../../lib/repository.ts';

export async function POST(request: Request) {
  try {
    const authorization = request.headers.get('authorization') || '';
    if (!authorization.startsWith('Bearer ')) return NextResponse.json({ error: 'Bearer ingestion key required' }, { status: 401 });
    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > 1_000_000) return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    const key = authorization.slice(7).trim();
    if (!key) return NextResponse.json({ error: 'Invalid or revoked ingestion key' }, { status: 401 });
    const db = (await import('../../../../lib/db.ts')).sql();
    const reader = request.body?.getReader();
    if (!reader) throw new Error('Invalid event batch');
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1_000_000) { await reader.cancel(); return NextResponse.json({ error: 'Payload too large' }, { status: 413 }); }
      chunks.push(value);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const result = await ingestWithKey(key, body, db);
    return NextResponse.json(result, { status: result.duplicate ? 200 : 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid event batch';
    const status = /already used with a different payload/i.test(message) ? 409 : /invalid or revoked|bearer ingestion/i.test(message) ? 401 : /too large/i.test(message) ? 413 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
