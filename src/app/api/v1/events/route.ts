import { NextResponse } from 'next/server';
import { ingestWithKey } from '../../../../lib/repository.ts';

export async function GET() {
  const html = [
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
    '<title>Quiet Insights event ingestion</title>',
    '<style>body{margin:0;background:#f7faf7;color:#17231c;font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}main{max-width:820px;margin:0 auto;padding:56px 24px 80px}h1{font-size:40px;line-height:1.1;letter-spacing:-.04em}h2{font-size:20px;margin-top:34px}p{color:#536158;max-width:68ch}pre{overflow:auto;background:#17231c;color:#f4faf4;border-radius:8px;padding:20px;font:13px/1.65 ui-monospace,SFMono-Regular,Menlo,monospace}code{background:#e8f0e9;border-radius:4px;padding:2px 5px}.badge{display:inline-block;background:#e4f5b5;color:#315521;border-radius:999px;padding:4px 10px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}.card{background:#fff;border:1px solid #d7e1d9;border-radius:10px;padding:20px 22px;margin-top:18px}</style></head><body><main>',
    '<span class="badge">POST endpoint</span><h1>Quiet Insights event ingestion</h1>',
    '<p>Send product events here from your server. Opening this URL in a browser only shows documentation.</p>',
    '<div class="card"><strong>Endpoint</strong><p><code>POST /api/v1/events</code></p><p>Use an ingestion key from Connect in the <code>Authorization: Bearer …</code> header.</p></div>',
    '<h2>Request body</h2><pre>{\n  "batchId": "checkout-20260929-001",\n  "events": [{\n    "name": "page_opened",\n    "timestamp": "2026-09-29T05:00:00.000Z",\n    "deviceId": "device-a91f",\n    "sessionId": "session-44",\n    "version": "1.0.0",\n    "os": "ios",\n    "country": "CN",\n    "properties": { "screen": "home", "plan": "free" }\n  }]\n}</pre>',
    '<h2>How the dashboard groups events</h2><p><code>name</code> ranks event types. <code>deviceId</code> counts anonymous devices. <code>sessionId</code> groups sessions. <code>version</code>, <code>os</code>, <code>country</code>, and properties such as <code>screen</code>, <code>plan</code>, <code>source</code>, <code>feature</code>, and <code>result</code> power filters and breakdowns.</p>',
    '<h2>Example request</h2><pre>curl "$API_URL/api/v1/events" \\\n  -H "Authorization: Bearer YOUR_INGESTION_KEY" \\\n  -H "Content-Type: application/json"</pre><p>Keep the ingestion key on your server. Open Connect in the workspace for a complete copyable example.</p></main></body></html>',
  ].join('');
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}

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
