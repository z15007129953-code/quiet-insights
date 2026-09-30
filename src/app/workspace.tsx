"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import OverviewReference from "./overview-reference";

type App = { id: string; name: string; retention: number };
type Ranked = { name: string; count: number };
type Event = {
  name: string;
  timestamp: string;
  deviceId: string;
  sessionId: string;
  version: string;
  os: string;
  country: string;
  properties: Record<string, string>;
};
type Analytics = {
  total: number;
  devices: number;
  sessions: number;
  trend: { date: string; count: number }[];
  ranking: Ranked[];
  breakdowns: { os: Ranked[]; country: Ranked[]; version: Ranked[] };
  recent: Event[];
  funnels: {
    id: string;
    name: string;
    steps: string[];
    windowHours: number;
    counts: number[];
  }[];
  versions: string[];
  partial: boolean;
};
type Tab = "overview" | "events" | "funnels" | "connect" | "settings";
type Language = "en" | "zh";
type Scope = {
  environment: string;
  days: string;
  version: string;
  propertyKey: string;
  propertyValue: string;
};
const initialScope: Scope = {
  environment: "production",
  days: "14",
  version: "",
  propertyKey: "",
  propertyValue: "",
};
const names: Record<Tab, [string, string]> = {
  overview: ["Overview", "概览"],
  events: ["Events", "事件"],
  funnels: ["Funnels", "转化漏斗"],
  connect: ["Connect", "接入"],
  settings: ["Settings", "设置"],
};

function Icon({ kind }: { kind: "mark" | "arrow" | "download" | "refresh" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {kind === "mark" ? (
        <>
          <path d="M4 17V9m5 8V4m5 13v-6m5 6V7" />
          <path d="M3 21h18" />
        </>
      ) : kind === "download" ? (
        <>
          <path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4" />
        </>
      ) : kind === "refresh" ? (
        <>
          <path d="M20 7v5h-5M4 17v-5h5" />
          <path d="M6 7a7 7 0 0 1 12-2l2 7M4 12l2 7a7 7 0 0 0 12-2" />
        </>
      ) : (
        <path d="M4 12h15m-6-6 6 6-6 6" />
      )}
    </svg>
  );
}
export default function Dashboard() {
  const [language, setLanguage] = useState<Language>("en");
  const t = (en: string, zh: string) => (language === "en" ? en : zh);
  const [tab, setTab] = useState<Tab>("overview");
  const [apps, setApps] = useState<App[]>([]),
    [appId, setAppId] = useState("");
  const [scope, setScope] = useState<Scope>(initialScope),
    [draft, setDraft] = useState<Scope>(initialScope);
  const [data, setData] = useState<Analytics | null>(null),
    [loading, setLoading] = useState(true),
    [pending, setPending] = useState(false);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [keys, setKeys] = useState<
      Partial<Record<"production" | "development", string>>
    >({}),
    [keyEnv, setKeyEnv] = useState<"production" | "development">("production");
  const key = keys[keyEnv] || "";
  const [appName, setAppName] = useState(""),
    [funnelName, setFunnelName] = useState(""),
    [steps, setSteps] = useState(["", "", ""]),
    [hours, setHours] = useState("24");
  const [testEventName, setTestEventName] = useState("page_opened");
  const [lastTestEvent, setLastTestEvent] = useState("");
  const [retention, setRetention] = useState("30");
  const [origin, setOrigin] = useState("");
  const requestSeq = useRef(0);
  const app = apps.find((a) => a.id === appId);
  const api = useCallback(async (path: string, body?: unknown) => {
    const response = await fetch(
      path,
      body
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        : undefined,
    );
    const payload = await response.json();
    if (!response.ok)
      throw new Error(
        typeof payload.error === "string"
          ? payload.error
          : payload.error?.message ||
            payload.message ||
            "Request failed. Please try again.",
      );
    return payload;
  }, []);
  const query = useCallback(
    () => new URLSearchParams({ appId, ...scope }).toString(),
    [appId, scope],
  );
  const load = useCallback(async (nextScope: Scope = scope, nextAppId = appId) => {
    if (!nextAppId) return;
    const seq = ++requestSeq.current;
    setLoading(true);
    setData(null);
    setError("");
    try {
      const result = await api(
        "/api/analytics?" +
          new URLSearchParams({ appId: nextAppId, ...nextScope }).toString(),
      );
      if (seq === requestSeq.current) setData(result);
    } catch (e) {
      if (seq === requestSeq.current) setError((e as Error).message);
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [appId, api, scope]);
  const bootstrap = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api("/api/state");
      setApps(result.apps);
      setAppId(result.apps[0]?.id || "");
      if (!result.apps.length) {
        setTab("connect");
        setLoading(false);
      }
    } catch (e) {
      setError((e as Error).message);
      setLoading(false);
    }
  }, [api]);
  useEffect(() => {
    setOrigin(window.location.origin);
    try {
      const saved = localStorage.getItem("quiet:language");
      if (saved === "zh") setLanguage("zh");
    } catch {}
    void bootstrap();
  }, [bootstrap]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    document.documentElement.lang = language;
    try {
      localStorage.setItem("quiet:language", language);
    } catch {}
  }, [language]);
  useEffect(() => {
    setRetention(String(app?.retention || 30));
  }, [app]);
  async function action(body: Record<string, unknown>, success: string) {
    setPending(true);
    setError("");
    setNotice("");
    try {
      const result = await api("/api/manage", { appId, ...body });
      setNotice(success);
      return result;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setPending(false);
    }
  }
  async function createApp(e: React.FormEvent) {
    e.preventDefault();
    const result = await action(
      { action: "createApp", name: appName },
      t(
        "Application created. Save both keys below.",
        "应用已创建，请保存下面两把密钥。",
      ),
    );
    if (result) {
      setApps([...apps, result.app]);
      setAppId(result.app.id);
      setScope(initialScope);
      setDraft(initialScope);
      setAppName("");
      setKeyEnv("production");
      setKeys(result.keys || { production: result.key });
    }
  }
  async function sample() {
    const result = await action(
      { action: "sample", environment: keyEnv },
      t("Sample events added.", "示例事件已写入。"),
    );
    if (result) {
      if (scope.environment === keyEnv) await load();
      else {
        setScope({ ...scope, environment: keyEnv });
        setDraft({ ...draft, environment: keyEnv });
      }
    }
  }
  async function demoJourney(e?: React.FormEvent) {
    e?.preventDefault();
    setNotice(
      t(
        "Preparing a guided demo with sample App activity…",
        "正在准备一套可体验的演示 App 数据…",
      ),
    );
    const result = await action(
      { action: "demo", environment: keyEnv },
      t(
        "Demo App loaded. Start with Overview, then open Events and Funnels.",
        "演示 App 已加载。先看概览，再打开事件和转化漏斗。",
      ),
    );
    if (!result) return;
    const nextScope = { ...scope, environment: keyEnv };
    setScope(nextScope);
    setDraft({ ...draft, environment: keyEnv });
    setTab("overview");
    await load(nextScope);
  }
  async function sendTestEvent() {
    setPending(true);
    setError("");
    setNotice("");
    try {
      const result = await action(
        {
          action: "testEvent",
          environment: keyEnv,
          name: testEventName.trim() || "test_event",
        },
        "",
      );
      if (!result) return;
      setNotice(
        t(
          "Test event received. Open Overview or Events to see it.",
          "测试事件已接收，可前往概览或事件查看。",
        ),
      );
      setLastTestEvent(testEventName.trim() || "test_event");
      if (scope.environment === keyEnv) await load();
      else {
        setScope({ ...scope, environment: keyEnv });
        setDraft({ ...draft, environment: keyEnv });
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  async function rotate() {
    if (
      !window.confirm(
        t(
          "Replace this environment’s key? The old key will stop working immediately.",
          "更换此环境的密钥？旧密钥将立即失效。",
        ),
      )
    )
      return;
    const result = await action(
      { action: "rotate", environment: keyEnv },
      t(
        "Key replaced. Update it in your application.",
        "密钥已更换，请更新应用中的密钥。",
      ),
    );
    if (result) setKeys((current) => ({ ...current, [keyEnv]: result.key }));
  }
  async function saveFunnel(e: React.FormEvent) {
    e.preventDefault();
    const result = await action(
      { action: "funnel", name: funnelName, steps, windowHours: Number(hours) },
      t("Funnel saved.", "漏斗已保存。"),
    );
    if (result) {
      setFunnelName("");
      await load();
    }
  }
  async function saveRetention(e: React.FormEvent) {
    e.preventDefault();
    if (
      !window.confirm(
        t(
          "Save retention? Events older than this period will be permanently deleted.",
          "保存保留期限？超过期限的事件将永久删除。",
        ),
      )
    )
      return;
    const result = await action(
      { action: "retention", days: Number(retention) },
      t("Retention updated.", "保留期限已更新。"),
    );
    if (result) {
      setApps((current) =>
        current.map((item) => (item.id === result.app.id ? result.app : item)),
      );
      await load();
    }
  }
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNotice(t("Copied.", "已复制。"));
    } catch {
      setError(
        t(
          "Copy is unavailable. Select and copy the text below.",
          "无法自动复制，请选择下方文字后复制。",
        ),
      );
    }
  }
  const fmt = (n: number) =>
    new Intl.NumberFormat(language === "zh" ? "zh-CN" : "en-US").format(n);
  const date = (value: string) =>
    new Date(value).toLocaleDateString(language === "zh" ? "zh-CN" : "en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  const max = Math.max(1, ...(data?.trend || []).map((d) => d.count));
  const example = JSON.stringify(
    {
      batchId: "example-" + Date.now(),
      events: [
        {
          name: "page_opened",
          timestamp: new Date().toISOString(),
          deviceId: "anonymous-device-01",
          sessionId: "session-01",
          version: "1.0.0",
          os: "web",
          country: "US",
          properties: { screen: "home", plan: "free" },
        },
      ],
    },
    null,
    2,
  );
  const command = `curl '${origin}/api/v1/events' \\\n  -H 'Authorization: Bearer ${key || "YOUR_INGESTION_KEY"}' \\\n  -H 'Content-Type: application/json' \\\n  --data '${example}'`;
  const jsExample = `await fetch('${origin}/api/v1/events', {\n  method: 'POST',\n  headers: { 'Content-Type': 'application/json',\n    Authorization: 'Bearer ${key || "YOUR_INGESTION_KEY"}' },\n  body: JSON.stringify(${example})\n});`;
  const metricCards = (rows: [string, string | number, string][]) => (
    <section
      className="metrics reference-metrics"
      aria-label={t("Key metrics", "关键指标")}
    >
      {rows.map(([label, value, caption]) => (
        <div key={label}>
          <p>{label}</p>
          <strong>{typeof value === "number" ? fmt(value) : value}</strong>
          <small>{caption}</small>
        </div>
      ))}
    </section>
  );
  const rank = (title: string, rows: Ranked[]) => (
    <section className="breakdown">
      <h3>{title}</h3>
      {rows.length ? (
        rows.slice(0, 6).map((row) => (
          <div className="rank-row" key={row.name}>
            <div>
              <span>{row.name || t("Unknown", "未知")}</span>
              <strong>{fmt(row.count)}</strong>
            </div>
            <div className="rank-track">
              <span
                style={{
                  width: `${(row.count / Math.max(1, data!.total)) * 100}%`,
                }}
              />
            </div>
          </div>
        ))
      ) : (
        <p className="muted">
          {t("No events in this period.", "此时间段暂无事件。")}
        </p>
      )}
    </section>
  );
  const connectGuide = (
    <ol className="connect-steps">
      <li>
        <strong>{t("Create an application", "创建应用")}</strong>
        <span>
          {t(
            "Give this workspace a name for your product.",
            "为你的产品在此工作区取一个名字。",
          )}
        </span>
      </li>
      <li>
        <strong>{t("Send events", "发送事件")}</strong>
        <span>
          {t(
            "Use the key below from your app server. One event is one product action.",
            "在你的应用服务端使用下面的密钥。一个事件代表一次产品操作。",
          )}
        </span>
      </li>
      <li>
        <strong>{t("Read the result", "查看结果")}</strong>
        <span>
          {t(
            "Open Overview or Events to see totals, devices, sessions and event types.",
            "回到概览或事件，查看总量、设备、会话和事件类型。",
          )}
        </span>
      </li>
    </ol>
  );
  return (
    <>
      <a className="skip" href="#main">
        {t("Skip to content", "跳到内容")}
      </a>
      <header className="header">
        <a className="wordmark" href="/" aria-label="Quiet Insights">
          <span className="brand-icon">
            <Icon kind="mark" />
          </span>
          Quiet Insights
        </a>
        <span className="local-badge">
          {t("Local workspace", "本地工作区")}
        </span>
        <button
          className="language"
          onClick={() => setLanguage(language === "en" ? "zh" : "en")}
        >
          EN <span>/</span> 中文
        </button>
      </header>
      <div className="workspace">
        <aside className="context-bar">
          <label className="app-picker">
            <span>{t("Application", "应用")}</span>
            <select
              aria-label={t("Application", "应用")}
              value={appId}
              disabled={pending}
              onChange={(e) => {
                setAppId(e.target.value);
                setKeys({});
              }}
            >
              {apps.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
              {!apps.length && (
                <option value="">
                  {t("Create an application", "创建应用")}
                </option>
              )}
            </select>
          </label>
          <nav aria-label={t("Main navigation", "主导航")}>
            {(Object.keys(names) as Tab[]).map((item) => (
              <button
                key={item}
                aria-current={item === tab ? "page" : undefined}
                className={tab === item ? "active" : ""}
                onClick={() => {
                  setTab(item);
                  setNotice("");
                }}
              >
                {names[item][language === "en" ? 0 : 1]}
              </button>
            ))}
          </nav>
        </aside>
        <main id="main">
          {tab !== "overview" && (
            <div className="page-heading">
              <div>
                <p className="eyebrow">
                  {app?.name || "Quiet Insights"} <span> / </span>{" "}
                  {t("Analytics", "数据分析")}
                </p>
                <h1>{names[tab][language === "en" ? 0 : 1]}</h1>
                <p className="subtitle">
                  {tab === "events"
                    ? t(
                        "The actions that matter to your product.",
                        "了解产品中的关键操作。",
                      )
                    : tab === "funnels"
                      ? t(
                          "See where people move forward, and where they stop.",
                          "查看用户在哪一步继续，在哪一步离开。",
                        )
                      : tab === "connect"
                        ? t(
                            "Start with a few events. Build from there.",
                            "从接收第一条事件开始。",
                          )
                        : t(
                            "Keep only the data you need.",
                            "只保留需要的数据。",
                          )}
                </p>
              </div>
              {appId && ["overview", "events", "funnels"].includes(tab) && (
                <div className="heading-actions">
                  <button
                    className="icon-button"
                    title={t("Refresh", "刷新")}
                    aria-label={t("Refresh", "刷新")}
                    disabled={loading}
                    onClick={() => void load()}
                  >
                    <Icon kind="refresh" />
                  </button>
                  <a
                    className="button secondary"
                    href={"/api/export?" + query()}
                  >
                    <Icon kind="download" />
                    {t("Export CSV", "导出 CSV")}
                  </a>
                </div>
              )}
            </div>
          )}
          {error && (
            <div className="message error" role="alert">
              {error}
              <button onClick={() => void (appId ? load() : bootstrap())}>
                {t("Retry", "重试")}
              </button>
            </div>
          )}
          {notice && (
            <div className="message success" role="status">
              {notice}
            </div>
          )}
          {appId &&
            tab !== "overview" &&
            ["events", "funnels"].includes(tab) && (
              <>
                <form
                  className="scope"
                  onSubmit={(e) => {
                    e.preventDefault();
                    setScope({ ...draft });
                  }}
                >
                  <label>
                    {t("Environment", "环境")}
                    <select
                      value={draft.environment}
                      onChange={(e) =>
                        setDraft({ ...draft, environment: e.target.value })
                      }
                    >
                      <option value="production">
                        {t("Production", "生产")}
                      </option>
                      <option value="development">
                        {t("Development", "开发")}
                      </option>
                    </select>
                  </label>
                  <label>
                    {t("Period · UTC", "时间 · UTC")}
                    <select
                      value={draft.days}
                      onChange={(e) =>
                        setDraft({ ...draft, days: e.target.value })
                      }
                    >
                      {[7, 14, 30, 90].map((d) => (
                        <option value={d} key={d}>
                          {t(`Last ${d} days`, `最近 ${d} 天`)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t("Version", "版本")}
                    <select
                      value={draft.version}
                      onChange={(e) =>
                        setDraft({ ...draft, version: e.target.value })
                      }
                    >
                      <option value="">{t("All versions", "所有版本")}</option>
                      {(data?.versions || []).map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t("Property", "属性")}
                    <select
                      value={draft.propertyKey}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          propertyKey: e.target.value,
                          propertyValue: "",
                        })
                      }
                    >
                      <option value="">
                        {t("All properties", "所有属性")}
                      </option>
                      {["screen", "plan", "source", "feature", "result"].map(
                        (p) => (
                          <option key={p}>{p}</option>
                        ),
                      )}
                    </select>
                  </label>
                  {draft.propertyKey && (
                    <label>
                      {t("Equals", "等于")}
                      <input
                        required
                        value={draft.propertyValue}
                        maxLength={64}
                        onChange={(e) =>
                          setDraft({ ...draft, propertyValue: e.target.value })
                        }
                        placeholder={t("Exact value", "精确值")}
                      />
                    </label>
                  )}
                  <button type="submit" className="button" disabled={loading}>
                    {t("Apply", "应用")}
                  </button>
                </form>
                <div className="scope-caption">
                  <span>
                    {scope.environment === "production"
                      ? t("Production", "生产")
                      : t("Development", "开发")}{" "}
                    · {t(`Last ${scope.days} days`, `最近 ${scope.days} 天`)} ·
                    UTC {scope.version && `· ${scope.version}`}{" "}
                    {scope.propertyKey &&
                      `· ${scope.propertyKey} = ${scope.propertyValue}`}
                  </span>
                  <span>
                    {t(
                      "Anonymous device IDs · no personal profiles",
                      "匿名设备标识 · 不建立个人档案",
                    )}
                  </span>
                </div>
              </>
            )}
          {loading && (
            <p className="loading" role="status">
              {t("Loading your workspace…", "正在读取工作区…")}
            </p>
          )}
          {data?.partial && (
            <p className="message" role="status">
              {t(
                "Showing the latest 50,000 matching events. Narrow the period for complete results.",
                "当前显示最近 50,000 条匹配事件，请缩短时间范围查看完整结果。",
              )}
            </p>
          )}
          {!loading && data && tab === "overview" && (
            <OverviewReference
              data={data}
              language={language}
              days={scope.days}
              date={date}
              fmt={fmt}
              onFunnels={() => setTab("funnels")}
            />
          )}
          {!loading && data && tab === "events" && (
            <>
              <div className="section-heading">
                <h2>{t("Event names", "事件名称")}</h2>
                <span>
                  {data.ranking.length} {t("types", "种")}
                </span>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{t("Event", "事件")}</th>
                      <th className="numeric">{t("Count", "次数")}</th>
                      <th className="numeric">{t("Share", "占比")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.ranking.map((row) => (
                      <tr key={row.name}>
                        <td className="event-name">{row.name}</td>
                        <td className="numeric">{fmt(row.count)}</td>
                        <td className="numeric">
                          {(
                            (row.count / Math.max(1, data.total)) *
                            100
                          ).toFixed(1)}
                          %
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!data.ranking.length && (
                  <p className="empty">
                    {t(
                      "No events match these filters.",
                      "没有符合筛选条件的事件。",
                    )}
                  </p>
                )}
              </div>
              <div className="section-heading separated">
                <h2>{t("Recent events", "最近事件")}</h2>
                <span>UTC</span>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{t("Event", "事件")}</th>
                      <th>{t("Time", "时间")}</th>
                      <th>{t("Version", "版本")}</th>
                      <th>{t("OS", "系统")}</th>
                      <th>{t("Properties", "属性")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent.map((e, i) => (
                      <tr key={i}>
                        <td className="event-name">{e.name}</td>
                        <td>
                          {new Date(e.timestamp)
                            .toISOString()
                            .slice(0, 19)
                            .replace("T", " ")}
                        </td>
                        <td>{e.version}</td>
                        <td>{e.os}</td>
                        <td>
                          {Object.entries(e.properties)
                            .map(([k, v]) => `${k}: ${v}`)
                            .join(" · ") || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {!loading && data && tab === "funnels" && (
            <div className="funnel-layout">
              <section>
                <h2>{t("Saved funnels", "已保存的漏斗")}</h2>
                {!data.funnels.length && (
                  <div className="empty">
                    <h3>
                      {t(
                        "Every journey has a next step.",
                        "看看用户的下一步。",
                      )}
                    </h3>
                    <p>
                      {t(
                        "Choose events in order to measure a journey.",
                        "按顺序选择事件，了解完成与流失情况。",
                      )}
                    </p>
                  </div>
                )}
                {data.funnels.map((f) => (
                  <article className="funnel" key={f.id}>
                    <div className="section-heading">
                      <h3>{f.name}</h3>
                      <span>
                        {f.windowHours}h · {t("same session", "同一会话")}
                      </span>
                    </div>
                    {f.steps.map((step, i) => (
                      <div className="funnel-step" key={i}>
                        <div>
                          <span className="step-number">{i + 1}</span>
                          <span>{step}</span>
                          <strong>{fmt(f.counts[i] || 0)}</strong>
                          <span>
                            {f.counts[0]
                              ? (
                                  ((f.counts[i] || 0) / f.counts[0]) *
                                  100
                                ).toFixed(1)
                              : "0"}
                            %
                          </span>
                        </div>
                        <div className="funnel-track">
                          <span
                            style={{
                              width: `${f.counts[0] ? ((f.counts[i] || 0) / f.counts[0]) * 100 : 0}%`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </article>
                ))}
              </section>
              <form className="side-form" onSubmit={saveFunnel}>
                <h2>{t("New funnel", "新建漏斗")}</h2>
                <label>
                  {t("Name", "名称")}
                  <input
                    value={funnelName}
                    required
                    maxLength={80}
                    onChange={(e) => setFunnelName(e.target.value)}
                    placeholder={t("From opening to saving", "从打开到保存")}
                  />
                </label>
                {steps.map((step, i) => (
                  <label key={i}>
                    {t(`Step ${i + 1}`, `第 ${i + 1} 步`)}
                    <select
                      required
                      value={step}
                      onChange={(e) =>
                        setSteps(
                          steps.map((s, j) => (j === i ? e.target.value : s)),
                        )
                      }
                    >
                      <option value="">{t("Choose event", "选择事件")}</option>
                      {data.ranking.map((row) => (
                        <option key={row.name}>{row.name}</option>
                      ))}
                    </select>
                  </label>
                ))}
                <div className="inline-actions">
                  <button
                    type="button"
                    className="text-button"
                    disabled={steps.length === 5}
                    onClick={() => setSteps([...steps, ""])}
                  >
                    {t("+ Add step", "＋ 添加步骤")}
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    disabled={steps.length === 2}
                    onClick={() => setSteps(steps.slice(0, -1))}
                  >
                    {t("Remove last", "移除末步")}
                  </button>
                </div>
                <label>
                  {t("Complete within", "完成时限")}
                  <select
                    value={hours}
                    onChange={(e) => setHours(e.target.value)}
                  >
                    {[1, 24, 72, 168].map((h) => (
                      <option value={h} key={h}>
                        {h} {t("hours", "小时")}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="help">
                  {t(
                    "Each device counts once. Steps must happen in order within the same session.",
                    "每台设备计一次，步骤必须在同一会话内按顺序发生。",
                  )}
                </p>
                <button
                  className="button"
                  disabled={pending || !data.ranking.length}
                >
                  {t("Save funnel", "保存漏斗")}
                </button>
              </form>
            </div>
          )}
          {tab === "connect" && (
            <div className="connect-layout">
              <section>
                <div className="section-heading">
                  <h2>{t("Send your first events", "发送第一批事件")}</h2>
                </div>
                <p className="body-copy">
                  {t(
                    "Use sample events to explore the workspace, or connect your own application with an ingestion key.",
                    "可以先添加示例事件体验工作区，也可以用接收密钥接入自己的应用。",
                  )}
                </p>
                {connectGuide}
                {appId && (
                  <>
                    <form className="demo-box" onSubmit={demoJourney}>
                      <div>
                        <p className="eyebrow">{t("Guided experience", "引导体验")}</p>
                        <h3>{t("See the whole journey once", "先完整体验一次")}</h3>
                        <p>
                          {t(
                            "Loads a fictional App journey with realistic events, devices, versions and a ready-made activation funnel. Nothing is sent to a real user.",
                            "加载一套虚构 App 的完整使用路径，包含事件、设备、版本和现成的转化漏斗，不会触达真实用户。",
                          )}
                        </p>
                      </div>
                      <button
                        className="button"
                        type="submit"
                        disabled={pending}
                      >
                        {pending
                          ? t("Preparing…", "正在准备…")
                          : t("Play the demo App", "体验演示 App")}
                        <Icon kind="arrow" />
                      </button>
                      <span>
                        {t(
                          "After loading: Overview → Events → Funnels",
                          "加载后按顺序查看：概览 → 事件 → 转化漏斗",
                        )}
                      </span>
                    </form>
                    <div className="sample-box">
                      <div>
                        <h3>{t("Try a sample journey", "体验示例流程")}</h3>
                        <p>
                          {t(
                            "Adds clearly named sample events over 14 days to the selected environment.",
                            "向当前环境写入最近 14 天的示例事件，事件名含示例标记。",
                          )}
                        </p>
                      </div>
                      <div>
                        <label>
                          {t("Send to environment", "写入环境")}
                          <select
                            value={keyEnv}
                            disabled={pending}
                            onChange={(e) => {
                              setKeyEnv(
                                e.target.value as "production" | "development",
                              );
                              setKeys((current) => current);
                            }}
                          >
                            <option value="production">
                              {t("Production", "生产")}
                            </option>
                            <option value="development">
                              {t("Development", "开发")}
                            </option>
                          </select>
                        </label>
                        <button
                          className="button secondary"
                          onClick={sample}
                          disabled={pending}
                        >
                          {pending
                            ? t("Adding…", "正在添加…")
                            : t("Add sample events", "添加示例事件")}
                        </button>
                      </div>
                    </div>
                    <div className="key-section">
                      <h2>{t("Ingestion key", "事件接收密钥")}</h2>
                      <label>
                        {t("Environment", "环境")}
                        <select
                          value={keyEnv}
                          disabled={pending}
                          onChange={(e) => {
                            setKeyEnv(
                              e.target.value as "production" | "development",
                            );
                            setKeys((current) => current);
                          }}
                        >
                          <option value="production">
                            {t("Production", "生产")}
                          </option>
                          <option value="development">
                            {t("Development", "开发")}
                          </option>
                        </select>
                      </label>
                      <button
                        className="button secondary"
                        disabled={pending}
                        onClick={rotate}
                      >
                        {t("Replace key", "更换密钥")}
                      </button>
                      {key ? (
                        <div className="key-reveal">
                          <p>
                            {t(
                              "Shown once. Save this key before leaving.",
                              "仅显示一次，离开前请保存。",
                            )}
                          </p>
                          <code>{key}</code>
                          <button
                            className="text-button"
                            onClick={() => void copy(key)}
                          >
                            {t("Copy key", "复制密钥")}
                          </button>
                        </div>
                      ) : (
                        <p className="help">
                          {t(
                            "Existing keys are not shown again. Replace the key if you need a new one.",
                            "已有密钥不会再次显示。如需新密钥，请点击更换。",
                          )}
                        </p>
                      )}
                    </div>
                    <div className="test-event-box">
                      <div>
                        <h2>{t("Check the connection", "检查连接")}</h2>
                        <p className="help">
                          {t(
                            "Send one safe browser event now. It will appear in your selected environment.",
                            "立即发送一条安全的浏览器测试事件，它会出现在当前环境中。",
                          )}
                        </p>
                      </div>
                      <label>
                        {t("Event name", "事件名称")}
                        <input
                          value={testEventName}
                          maxLength={80}
                          pattern="[A-Za-z][A-Za-z0-9_.:-]{0,99}"
                          onChange={(e) => setTestEventName(e.target.value)}
                        />
                      </label>
                      <button
                        className="button"
                        type="button"
                        onClick={() => void sendTestEvent()}
                        disabled={pending}
                      >
                        {pending
                          ? t("Sending…", "正在发送…")
                          : t("Send test event", "发送测试事件")}
                      </button>
                      {lastTestEvent && (
                        <div className="test-event-result" role="status">
                          <span>
                            {t(
                              `Received: ${lastTestEvent}`,
                              `已接收：${lastTestEvent}`,
                            )}
                          </span>
                          <button
                            type="button"
                            className="text-button"
                            onClick={() => {
                              setTab("events");
                              setNotice("");
                            }}
                          >
                            {t("View Events →", "查看事件 →")}
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="event-field-guide">
                      <div className="section-heading">
                        <h2>
                          {t("What each event includes", "每条事件包含什么")}
                        </h2>
                        <span>{t("Keep it anonymous", "保持匿名")}</span>
                      </div>
                      <div className="event-field-grid">
                        <div>
                          <strong>name</strong>
                          <span>
                            {t(
                              "The action, such as checkout_started.",
                              "动作名称，例如 checkout_started。",
                            )}
                          </span>
                        </div>
                        <div>
                          <strong>deviceId</strong>
                          <span>
                            {t(
                              "A random ID for one device. Never use a name or email.",
                              "一台设备的随机标识，不要使用姓名或邮箱。",
                            )}
                          </span>
                        </div>
                        <div>
                          <strong>sessionId</strong>
                          <span>
                            {t(
                              "Groups actions from one visit so journeys can be measured.",
                              "把一次访问中的动作归在一起，用来计算路径。",
                            )}
                          </span>
                        </div>
                        <div>
                          <strong>properties</strong>
                          <span>
                            {t(
                              "Optional categories such as plan, screen or source.",
                              "可选分类，例如 plan、screen 或 source。",
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="section-heading separated">
                      <h2>{t("HTTP example", "HTTP 示例")}</h2>
                      <button
                        className="text-button"
                        onClick={() => void copy(command)}
                      >
                        {t("Copy", "复制")}
                      </button>
                    </div>
                    <pre>{command}</pre>
                    <details className="data-details">
                      <summary>
                        {t("JavaScript example", "JavaScript 示例")}
                      </summary>
                      <button
                        className="text-button"
                        onClick={() => void copy(jsExample)}
                      >
                        {t("Copy", "复制")}
                      </button>
                      <pre>{jsExample}</pre>
                    </details>
                    <p className="help">
                      {t(
                        "Run from your application server. Each batch needs a unique ID; reuse that ID only when retrying the same events. Never send names, emails or IP addresses.",
                        "从应用服务端发送。每批事件使用唯一 ID，重试相同事件时复用该 ID。不要发送姓名、邮箱或 IP 地址。",
                      )}
                    </p>
                  </>
                )}
              </section>
              <form className="side-form" onSubmit={createApp}>
                <p className="eyebrow">{t("A fresh start", "新的开始")}</p>
                <h2>{t("New application", "新建应用")}</h2>
                <label>
                  {t("Application name", "应用名称")}
                  <input
                    required
                    minLength={2}
                    maxLength={60}
                    value={appName}
                    onChange={(e) => setAppName(e.target.value)}
                    placeholder={t("Your product name", "你的产品名称")}
                  />
                </label>
                <button className="button" disabled={pending}>
                  {t("Create application", "创建应用")}
                  <Icon kind="arrow" />
                </button>
                <p className="help">
                  {t(
                    "Each application keeps its own events, keys and funnels.",
                    "每个应用拥有独立的事件、密钥和漏斗。",
                  )}
                </p>
              </form>
            </div>
          )}
          {tab === "settings" && (
            <div className="settings-layout">
              <form className="settings-panel" onSubmit={saveRetention}>
                <h2>{t("Data retention", "数据保留期限")}</h2>
                <p className="body-copy">
                  {t(
                    "Events older than this period are removed. Shortening it permanently deletes older events.",
                    "超过期限的事件会被清理。缩短期限将永久删除较早的事件。",
                  )}
                </p>
                <label>
                  {t("Keep events for", "保留事件")}
                  <select
                    value={retention}
                    onChange={(e) => setRetention(e.target.value)}
                  >
                    {[7, 30, 90].map((d) => (
                      <option key={d} value={d}>
                        {d} {t("days", "天")}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="button" disabled={pending || !appId}>
                  {t("Save retention", "保存期限")}
                </button>
              </form>
              <section className="settings-panel">
                <h2>{t("About this workspace", "关于工作区")}</h2>
                <p className="body-copy">
                  {t(
                    "Data is saved in a local database. This browser has its own workspace; real accounts and team access are not enabled.",
                    "数据保存在本地数据库。当前浏览器拥有独立工作区，尚未启用真实账号和团队权限。",
                  )}
                </p>
                <h3>{t("Collect less", "减少收集")}</h3>
                <p className="body-copy">
                  {t(
                    "No personal profiles or session recordings. Use random device IDs and categorical properties. Anonymous IDs can still be sensitive; avoid identifiable or confidential values.",
                    "不建立个人档案，不录制会话。请使用随机设备标识和类别属性。匿名标识仍可能具有敏感性，请勿发送可识别身份或机密的值。",
                  )}
                </p>
              </section>
            </div>
          )}
        </main>
        <footer>
          <span>Quiet Insights</span>
          <span>
            {t("Less noise. Clearer decisions.", "减少干扰，让判断更清楚。")}
          </span>
        </footer>
      </div>
    </>
  );
}
