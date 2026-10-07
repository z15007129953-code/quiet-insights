'use client';

import { useMemo, useState } from 'react';

type Ranked = { name: string; count: number };
type EventRow = { name: string; timestamp: string; deviceId: string; os: string; country: string; properties: Record<string, string> };
type Funnel = { name: string; steps: string[]; counts: number[] };

export type OverviewData = {
  total: number;
  devices: number;
  sessions: number;
  trend: { date: string; count: number }[];
  ranking: Ranked[];
  breakdowns: { os: Ranked[]; country: Ranked[]; version: Ranked[] };
  recent: EventRow[];
  funnels: Funnel[];
};

type OverviewProps = {
  data: OverviewData;
  language: 'en' | 'zh';
  days: string;
  date: (value: string) => string;
  fmt: (value: number) => string;
  onFunnels: () => void;
};

const copy = (language: 'en' | 'zh', en: string, zh: string) => language === 'en' ? en : zh;

function SearchIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>;
}

function CalendarIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/></svg>;
}

export default function OverviewReference({ data, language, days, date, fmt, onFunnels }: OverviewProps) {
  const t = (en: string, zh: string) => copy(language, en, zh);
  const max = Math.max(1, ...data.trend.map((item) => item.count));
  const funnel = data.funnels[0];
  const [eventQuery, setEventQuery] = useState('');
  const [eventFilter, setEventFilter] = useState('');
  const recentEvents = useMemo(() => {
    const query = eventQuery.trim().toLowerCase();
    return data.recent
      .filter((event) => !eventFilter || event.name === eventFilter)
      .filter((event) => {
        if (!query) return true;
        return [event.name, event.deviceId, event.os, event.country, ...Object.entries(event.properties).flat()]
          .some((value) => value.toLowerCase().includes(query));
      })
      .slice(0, 8);
  }, [data.recent, eventFilter, eventQuery]);

  return <div className="reference-overview">
    <section className="reference-intro">
      <p className="reference-kicker">{t('PRODUCT ANALYTICS FOR BUILDERS', '产品分析工作台')}</p>
      <h2>{t('Understand what drives your product forward.', '看清真正推动产品前进的行为。')}</h2>
      <p>{t('Turn user behavior into clearer decisions. Quiet Insights helps you measure, explore, and grow with confidence.', '把用户行为变成更清晰的判断，用数据帮助产品持续改进。')}</p>
    </section>

    <section className="reference-metrics" aria-label={t('Key metrics', '关键指标')}>
      <article><div><p>{t('Total events', '事件总数')}</p><span className="metric-mark">◌</span></div><strong>{fmt(data.total)}</strong><small>{t('in the selected period', '当前时间范围')}</small></article>
      <article className="metric-highlight"><div><p>{t('Active devices', '活跃设备')}</p><span className="metric-mark">▥</span></div><strong>{fmt(data.devices)}</strong><small>{t('distinct anonymous IDs', '不重复匿名设备标识')}</small></article>
      <article><div><p>{t('Event types', '事件类型')}</p><span className="metric-mark">ϟ</span></div><strong>{fmt(data.ranking.length)}</strong><small>{t('tracked in this period', '当前时间范围内已记录')}</small></article>
      <article><div><p>{t('Events / device', '设备事件数')}</p><span className="metric-mark">↗</span></div><strong>{(data.total / Math.max(1, data.devices)).toFixed(1)}</strong><small>{t('average in this period', '当前时间范围平均值')}</small></article>
    </section>

    <section className="reference-analysis-grid">
      <article className="reference-panel reference-activity">
        <header><div><h3>{t('User activity', '用户活动')}</h3><p>{t('Daily active events over time', '每日活跃事件趋势')}</p></div><div className="reference-panel-controls"><span className="reference-panel-filter reference-static-filter">{t('Daily', '每日')}</span><span className="reference-panel-filter reference-static-filter"><CalendarIcon/>{t(`Last ${days} days`, `最近 ${days} 天`)}</span></div></header>
        {data.total ? <>
          <div className="reference-chart"><div className="reference-y-axis"><span>{fmt(max)}</span><span>{fmt(Math.round(max / 2))}</span><span>0</span></div><div className="reference-chart-canvas"><svg viewBox="0 0 700 240" preserveAspectRatio="none" aria-hidden="true"><path className="reference-gridline" d="M0 8H700M0 120H700M0 232H700"/><polyline points={data.trend.map((item, index) => `${data.trend.length === 1 ? 350 : index / (data.trend.length - 1) * 700},${232 - item.count / max * 220}`).join(' ')}/><polygon points={`0,240 ${data.trend.map((item, index) => `${data.trend.length === 1 ? 350 : index / (data.trend.length - 1) * 700},${232 - item.count / max * 220}`).join(' ')} 700,240`}/>{data.trend.map((item, index) => <circle key={item.date} cx={data.trend.length === 1 ? 350 : index / (data.trend.length - 1) * 700} cy={232 - item.count / max * 220} r="3"><title>{date(item.date)}: {fmt(item.count)}</title></circle>)}</svg></div></div>
          <div className="reference-x-axis"><span>{data.trend[0] && date(data.trend[0].date)}</span><span>{data.trend.at(-1) && date(data.trend.at(-1)!.date)}</span></div>
        </> : <div className="reference-empty">{t('No events in this period.', '此时间段暂无事件。')}</div>}
      </article>
      <article className="reference-panel reference-funnel">
        <header><div><h3>{t('Signup funnel', '注册漏斗')}</h3><p>{t('From signup up to activation', '从注册到激活')}</p></div><span className="reference-panel-filter reference-static-filter"><CalendarIcon/>{t(`Last ${days} days`, `最近 ${days} 天`)}</span></header>
        {funnel ? <div className="reference-funnel-steps">{funnel.steps.map((step, index) => { const percent = funnel.counts[0] ? (funnel.counts[index] || 0) / funnel.counts[0] * 100 : 0; return <div key={`${step}-${index}`}><div><span>{step}</span><strong>{fmt(funnel.counts[index] || 0)}</strong></div><small>{percent.toFixed(0)}%</small><div className="reference-funnel-track"><span style={{ width: `${percent}%` }}/></div></div>; })}</div> : <div className="reference-empty"><p>{t('No funnel saved yet.', '还没有保存漏斗。')}</p><button onClick={onFunnels}>{t('Create a funnel →', '创建漏斗 →')}</button></div>}
      </article>
    </section>

    <section className="reference-panel reference-events">
      <header><div><h3>{t('Recent events', '最近事件')}</h3><p>{t('Latest actions received from your product', '最近从产品接收到的行为记录')}</p></div><div className="reference-panel-controls"><label className="reference-event-search"><SearchIcon/><input value={eventQuery} onChange={(event) => setEventQuery(event.target.value)} placeholder={t('Search events…', '搜索事件…')} aria-label={t('Search recent events', '搜索最近事件')}/></label><select value={eventFilter} onChange={(event) => setEventFilter(event.target.value)} className="reference-panel-filter" aria-label={t('Filter event type', '筛选事件类型')}><option value="">{t('All events', '全部事件')}</option>{data.ranking.map((row) => <option key={row.name} value={row.name}>{row.name}</option>)}</select></div></header>
      <div className="reference-event-table">{recentEvents.length ? <table><thead><tr><th>{t('Device', '设备')}</th><th>{t('Event', '事件')}</th><th>{t('Properties', '属性')}</th><th>{t('Time', '时间')}</th><th>{t('Platform', '平台')}</th><th>{t('Location', '位置')}</th></tr></thead><tbody>{recentEvents.map((event, index) => <tr key={`${event.timestamp}-${event.name}-${index}`}><td><span className="reference-avatar">{(event.deviceId || 'AN').slice(-2).toUpperCase()}</span>{(event.deviceId || 'anonymous').slice(0, 12)}</td><td className="reference-event-name">{event.name}</td><td>{Object.entries(event.properties).slice(0, 2).map(([key, value]) => <span className="reference-chip" key={key}>{key}: {value}</span>)}</td><td>{date(event.timestamp)}</td><td>{event.os || 'Web'}</td><td>{event.country || '—'}</td></tr>)}</tbody></table> : <div className="reference-empty">{t('No recent events match this search.', '没有符合条件的最近事件。')}</div>}</div>
    </section>
  </div>;
}
