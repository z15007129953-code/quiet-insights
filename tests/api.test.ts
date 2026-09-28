import test from 'node:test';
import assert from 'node:assert/strict';

const base = process.env.QUIET_API_URL || 'http://127.0.0.1:4182';
let cookie = '';
let otherCookie = '';

async function waitForServer() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try { const response = await fetch(`${base}/api/state`); if (response.ok) return; } catch { /* wait */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Start the local application with npm start or npm run dev before API tests');
}

async function request(path: string, init: RequestInit = {}, useOther = false) {
  const headers = new Headers(init.headers);
  headers.set('origin', base);
  if (useOther ? otherCookie : cookie) headers.set('cookie', useOther ? otherCookie : cookie);
  const response = await fetch(`${base}${path}`, { ...init, headers });
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) { const value = setCookie.split(';')[0]; if (useOther) otherCookie = value; else cookie = value; }
  const text = await response.text();
  let body: unknown;
  try { body = JSON.parse(text); } catch { body = text; }
  return { response, body };
}

test('live API isolates workspaces and handles ingestion contracts', async () => {
  await waitForServer();
  const state = await request('/api/state');
  assert.equal(state.response.status, 200);
  const appId = (state.body as { apps: [{ id: string }] }).apps[0].id;
  const created = await request('/api/manage', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'createApp', name: `API ${Date.now()}` }) });
  assert.equal(created.response.status, 200);
  const noOrigin = await fetch(`${base}/api/manage`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ action: 'createApp', name: 'Must reject' }) });
  assert.equal(noOrigin.status, 400, 'Management writes require a matching origin');
  const createdBody = created.body as { app: { id: string }; key: string; keys: { development: string } };
  assert.match(createdBody.key, /^qi_/);
  assert.match(createdBody.keys.development, /^qi_/);
  assert.notEqual(createdBody.key, createdBody.keys.development);
  const event = { name: 'api_opened', timestamp: new Date().toISOString(), deviceId: 'api-device', sessionId: 'api-session', version: '1.0.0', os: 'iOS', country: 'CN', properties: { screen: 'home', source: 'test' } };
  const batch = { batchId: `api-${Date.now()}`, events: [event] };
  const sent = await request('/api/v1/events', { method: 'POST', headers: { authorization: `Bearer ${createdBody.key}`, 'content-type': 'application/json' }, body: JSON.stringify(batch) });
  assert.equal(sent.response.status, 202);
  const duplicate = await request('/api/v1/events', { method: 'POST', headers: { authorization: `Bearer ${createdBody.key}`, 'content-type': 'application/json' }, body: JSON.stringify(batch) });
  assert.equal(duplicate.response.status, 200);
  const altered = await request('/api/v1/events', { method: 'POST', headers: { authorization: `Bearer ${createdBody.key}`, 'content-type': 'application/json' }, body: JSON.stringify({ ...batch, events: [{ ...event, name: 'api_changed' }] }) });
  assert.equal(altered.response.status, 409);
  const production = await request(`/api/analytics?appId=${createdBody.app.id}&environment=production&days=7`);
  assert.equal((production.body as { total: number }).total, 1);
  const send = (payload: unknown, key = createdBody.key) => request('/api/v1/events', { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  const future = await send({ ...batch, batchId: 'future', events: [{ ...event, timestamp: new Date(Date.now() + 3600000).toISOString() }] });
  assert.equal(future.response.status, 400);
  const personal = await send({ ...batch, batchId: 'personal', events: [{ ...event, properties: { email: 'test@example.com' } }] });
  assert.equal(personal.response.status, 400);
  const large = await request('/api/v1/events', { method: 'POST', headers: { authorization: `Bearer ${createdBody.key}` }, body: 'x'.repeat(1_000_001) });
  assert.equal(large.response.status, 413);
  const development = await request('/api/v1/events', { method: 'POST', headers: { authorization: `Bearer ${createdBody.keys.development}`, 'content-type': 'application/json' }, body: JSON.stringify({ ...batch, batchId: `${batch.batchId}-dev` }) });
  assert.equal(development.response.status, 202);
  const devAnalytics = await request(`/api/analytics?appId=${createdBody.app.id}&environment=development&days=7`);
  assert.equal((devAnalytics.body as { total: number }).total, 1);
  const otherState = await request('/api/state', {}, true);
  assert.equal(otherState.response.status, 200);
  const denied = await request(`/api/analytics?appId=${createdBody.app.id}&environment=production&days=7`, {}, true);
  assert.equal(denied.response.status, 400);
  for (const action of ['rotate', 'sample', 'retention', 'funnel']) {
    const deniedWrite = await request('/api/manage', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, appId: createdBody.app.id, days: 7, name: 'Denied', steps: ['api_opened', 'api_saved'], windowHours: 24 }) }, true);
    assert.equal(deniedWrite.response.status, 404);
  }
  const samples = await request('/api/manage', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'sample', appId: createdBody.app.id, environment: 'production' }) });
  assert.equal(samples.response.status, 200);
  const funnel = await request('/api/manage', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'funnel', appId: createdBody.app.id, name: 'Sample path', steps: ['sample_opened','sample_viewed','sample_saved'], windowHours: 24 }) });
  assert.equal(funnel.response.status, 200);
  const sampleAnalytics = await request(`/api/analytics?appId=${createdBody.app.id}&environment=production&days=30`);
  assert.equal(sampleAnalytics.response.status, 200);
  assert.equal((sampleAnalytics.body as {total:number}).total, 57);
  assert.deepEqual((sampleAnalytics.body as {funnels:{counts:number[]}[]}).funnels[0].counts, [10,10,10]);
  const propertyAnalytics = await request(`/api/analytics?appId=${createdBody.app.id}&environment=production&days=30&propertyKey=screen&propertyValue=editor`);
  assert.equal((propertyAnalytics.body as { total:number }).total, 28);
  const replaced = await request('/api/manage', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'rotate', appId: createdBody.app.id, environment: 'production' }) });
  assert.equal(replaced.response.status, 200);
  assert.equal((await send({ ...batch, batchId: 'revoked' })).response.status, 401);
  assert.equal((await send({ ...batch, batchId: 'replacement' }, (replaced.body as {key:string}).key)).response.status, 202);
  const retention = await request('/api/manage', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'retention', appId: createdBody.app.id, days: 7 }) });
  assert.equal(retention.response.status, 200);
  const exported = await request(`/api/export?appId=${createdBody.app.id}&environment=production&days=7`);
  assert.equal(exported.response.status, 200);
  assert.match(String(exported.body), /"event","count"/);
  assert.doesNotMatch(String(exported.body), /api-device/);
  void appId;
});
