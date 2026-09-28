import { z } from 'zod';

const categorical = z.string().trim().min(1).max(80).refine((value) => {
  if (/[\r\n]/.test(value)) return false;
  if (/^[=+\-@]/.test(value)) return false;
  if (/\b[^\s@]+@[^\s@]+\.[^\s@]+\b/.test(value)) return false;
  if (/\b(?:\d{1,3}\.){3}\d{1,3}\b/.test(value)) return false;
  return true;
}, 'categorical value contains identifying data');

const propertiesSchema = z.strictObject({
  screen: categorical.optional(),
  plan: categorical.optional(),
  source: categorical.optional(),
  feature: categorical.optional(),
  result: categorical.optional(),
}).refine((properties) => Object.keys(properties).length <= 5);

export const eventSchema = z.strictObject({
  name: z.string().trim().regex(/^[A-Za-z][A-Za-z0-9_.:-]{0,99}$/),
  timestamp: z.string().datetime({ offset: true }).refine((value) => Number.isFinite(Date.parse(value))),
  deviceId: categorical.max(160),
  sessionId: categorical.max(160),
  version: categorical.max(80),
  os: categorical.max(80),
  country: z.string().regex(/^[A-Z]{2}$/),
  properties: propertiesSchema,
});

export const batchSchema = z.strictObject({
  batchId: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/),
  events: z.array(eventSchema).min(1).max(1000),
});

export type Event = z.infer<typeof eventSchema>;
export type Batch = z.infer<typeof batchSchema>;

export type Summary = {
  total: number;
  devices: number;
  sessions: number;
  trend: Array<{ date: string; count: number }>;
  ranking: Array<{ name: string; count: number }>;
  breakdowns: {
    os: Array<{ name: string; count: number }>;
    country: Array<{ name: string; count: number }>;
    version: Array<{ name: string; count: number }>;
  };
};

function countBy(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function summarize(events: Event[]): Summary {
  const trendMap = new Map<string, number>();
  for (const event of events) {
    const date = event.timestamp.slice(0, 10);
    trendMap.set(date, (trendMap.get(date) ?? 0) + 1);
  }
  const trend = [...trendMap.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));
  return {
    total: events.length,
    devices: new Set(events.map((event) => event.deviceId)).size,
    sessions: new Set(events.map((event) => `${event.deviceId}\u0000${event.sessionId}`)).size,
    trend,
    ranking: countBy(events.map((event) => event.name)),
    breakdowns: {
      os: countBy(events.map((event) => event.os)),
      country: countBy(events.map((event) => event.country)),
      version: countBy(events.map((event) => event.version)),
    },
  };
}

/** Return cumulative unique device counts for an ordered same-session funnel. */
export function funnel(events: Event[], steps: string[], windowHours: number): number[] {
  if (steps.length === 0) return [];
  const grouped = new Map<string, Event[]>();
  for (const event of events) {
    const key = `${event.deviceId}\u0000${event.sessionId}`;
    const list = grouped.get(key) ?? [];
    list.push(event);
    grouped.set(key, list);
  }
  const qualifiedByDevice = new Map<string, number>();
  for (const sessionEvents of grouped.values()) {
    const ordered = [...sessionEvents].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
    let best = 0;
    for (let start = 0; start < ordered.length; start += 1) {
      if (ordered[start].name !== steps[0]) continue;
      let matched = 1;
      const firstAt = Date.parse(ordered[start].timestamp);
      let previousAt = firstAt;
      for (let index = start + 1; index < ordered.length && matched < steps.length; index += 1) {
        if (ordered[index].name !== steps[matched]) continue;
        const at = Date.parse(ordered[index].timestamp);
        if (at - firstAt > windowHours * 60 * 60 * 1000) break;
        if (at <= previousAt) continue;
        previousAt = at;
        matched += 1;
      }
      best = Math.max(best, matched);
      if (best === steps.length) break;
    }
    const device = sessionEvents[0].deviceId;
    qualifiedByDevice.set(device, Math.max(best, qualifiedByDevice.get(device) ?? 0));
  }
  const counts = steps.map((_, index) => [...qualifiedByDevice.values()].filter((value) => value >= index + 1).length);
  return counts;
}

function csvCell(value: unknown): string {
  let text = String(value ?? '');
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function csv(rows: unknown[][]): string {
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

export function parseDays(value: string | null | undefined): 7 | 14 | 30 | 90 {
  const days = Number(value ?? 7);
  return days === 14 || days === 30 || days === 90 ? days : 7;
}

export function parseEnvironment(value: string | null | undefined): 'production' | 'development' {
  return value === 'development' ? 'development' : 'production';
}
