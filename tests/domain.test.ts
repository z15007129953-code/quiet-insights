import test from 'node:test';
import assert from 'node:assert/strict';
import { batchSchema, summarize, funnel, csv, type Event } from '../src/lib/domain.ts';
const event = (name: string, hour: number, sessionId = 's1'): Event => ({name, timestamp: new Date(Date.UTC(2026,8,28,hour)).toISOString(), deviceId:'d1',sessionId,version:'1.0',os:'iOS',country:'CN',properties:{plan:'free'}});
test('bounded event schema rejects identifying data and unknown fields', () => {
 assert.equal(batchSchema.safeParse({batchId:'batch-0001',events:[event('opened',1)]}).success,true);
 for (const extra of [{email:'x@y.com'},{properties:{screen:'x@y.com'}},{properties:{email:'hello'}},{deviceId:'192.168.1.1'}]) assert.equal(batchSchema.safeParse({batchId:'batch-0001',events:[{...event('opened',1),...extra}]}).success,false);
});
test('metrics count devices and session pairs, and filter categorical properties',()=>{
 const events=[event('opened',1),event('saved',2),{...event('opened',3),deviceId:'d2'}];
 const summary=summarize(events);
 assert.deepEqual([summary.total,summary.devices,summary.sessions],[3,2,2]);
 assert.equal(summary.trend[0].count,3);
});
test('funnel is ordered within one session and completion window',()=>{
 const events=[event('opened',1),event('saved',2),event('paid',4),event('paid',2,'other')];
 assert.deepEqual(funnel(events,['opened','saved','paid'],2),[1,1,0]);
 assert.deepEqual(funnel(events,['opened','saved','paid'],4),[1,1,1]);
 assert.deepEqual(funnel([event('opened',2),event('saved',1)],['opened','saved'],24),[1,0]);
});
test('CSV escapes quotes and neutralizes spreadsheet formulas',()=>{
 assert.equal(csv([['event','count'],['=SUM(A1)',2],['a"b',3]]),'"event","count"\r\n"\'=SUM(A1)","2"\r\n"a""b","3"');
});
test('funnel skips equal timestamps and counts each device once across sessions',()=>{
 const events=[event('opened',1),event('saved',1),event('saved',2),event('opened',1,'s2'),event('saved',2,'s2')];
 assert.deepEqual(funnel(events,['opened','saved'],24),[1,1]);
 assert.deepEqual(funnel([event('opened',1),event('opened',4),event('saved',5)],['opened','saved'],1),[1,1]);
});
