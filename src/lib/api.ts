import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { appsForWorkspace, createApplication, ingest, rotateKey, saveFunnel, updateRetention, workspaceForCookie, type App, type Environment } from './repository.ts';
import { ensureSchema, sql } from './db.ts';

const COOKIE = 'quiet_workspace';

export async function currentWorkspace() {
  const jar = await cookies();
  let token = jar.get(COOKIE)?.value;
  if (!token) token = randomBytes(32).toString('base64url');
  const db = sql();
  const workspace = await workspaceForCookie(createHash('sha256').update(token).digest('hex'), db);
  if (!jar.get(COOKIE)) jar.set(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 * 365 });
  return { id: workspace.id, db };
}

export function assertSameOrigin(request: Request): void {
  const requestUrl = new URL(request.url);
  const supplied = request.headers.get('origin') || (request.headers.get('referer') ? new URL(request.headers.get('referer')!).origin : '');
  const host = request.headers.get('host') || requestUrl.host;
  const protocol = requestUrl.protocol.replace(':', '');
  const expected = `${protocol}://${host}`;
  if (supplied && supplied === expected) return;

  throw new Error('Same-origin request required');
}

export async function stateForWorkspace(workspaceId: string, db = sql()) {
  let apps = await appsForWorkspace(workspaceId, db);
  if (apps.length === 0) {
    const seeded = await createApplication(workspaceId, 'Fieldnotes', db);
    await seedDemo(seeded.app, seeded.keys, db);
    apps = [seeded.app];
  }
  return { apps };
}

async function seedDemo(app: App, keys: Record<Environment, string>, db: ReturnType<typeof import('./db.ts').sql>) {
  const now = Date.now();
  const names = ['sample_opened', 'sample_viewed', 'sample_saved', 'sample_shared'];
  const events = Array.from({ length: 56 }, (_, index) => {
    const day = Math.floor(index / 4);
    const step = index % 4;
    const at = new Date(now - day * 86_400_000 - 60 * 60_000 + step * 15 * 60_000);
    return { name: names[step], timestamp: at.toISOString(), deviceId: `demo-device-${day % 11}`, sessionId: `demo-session-${day}`, version: day % 3 === 0 ? '1.1.0' : '1.0.0', os: day % 2 ? 'Android' : 'iOS', country: day % 3 ? 'US' : 'CN', properties: { screen: step % 2 ? 'editor' : 'home', plan: day % 4 ? 'free' : 'pro', source: 'demo' } };
  });
  // Seed data through the same ingestion path as a real application, while
  // keeping every timestamp safely in the past so clock skew cannot reject it.
  await ingest(app.id, 'production', { batchId: `demo-${randomBytes(8).toString('hex')}`, events }, 30, db);
  void keys;
}

export { ensureSchema };
