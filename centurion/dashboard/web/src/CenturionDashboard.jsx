import React, { useState, useEffect, useMemo } from "react";
import {
  AreaChart, Area, XAxis, YAxis, ResponsiveContainer, ReferenceLine, Tooltip,
  PieChart, Pie, Cell,
} from "recharts";
import {
  Activity, Pause, Play, Power, ShieldCheck, Cpu, Zap, Check, X,
  TrendingUp, TrendingDown, Gauge, Server, Radio,
} from "lucide-react";
import { fetchState, control } from "./api.js";

// ---- ScaleMBS / Centurion theme tokens ---------------------------------
const T = {
  bg: "#07090D", panel: "#0E1218", raised: "#131A23", border: "#1C2530",
  borderLit: "#2E3A46", text: "#F2F5F8", muted: "#7A8699", dim: "#4C5564",
  cyan: "#2DE2E6", cyanDeep: "#12B6BC", gain: "#3DDC97", loss: "#FF5C6C", warn: "#F5B544",
};

const usd = (n, sign = false) => {
  const x = Number(n) || 0;
  const s = x < 0 ? "-" : sign ? "+" : "";
  return s + "$" + Math.abs(x).toFixed(2);
};
const num = { fontVariantNumeric: "tabular-nums" };
const mono = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" };

// ---- small components ---------------------------------------------------
function Panel({ title, icon, right, children, span }) {
  return (
    <div className={span || ""} style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 16 }}>
      {title && (
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <div className="flex items-center gap-2">
            {icon}
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: T.muted }}>{title}</span>
          </div>
          {right}
        </div>
      )}
      <div className="px-4 pb-4">{children}</div>
    </div>
  );
}

function Spark({ data, color }) {
  const w = 88, h = 28, pad = 2;
  if (!data || data.length < 2) data = [0, 0];
  const min = Math.min(...data), max = Math.max(...data);
  const rng = max - min || 1;
  const pts = data.map((d, i) => {
    const x = pad + (i / (data.length - 1)) * (w - pad * 2);
    const y = h - pad - ((d - min) / rng) * (h - pad * 2);
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg width={w} height={h} aria-hidden>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function Ring({ pct, size = 120, stroke = 10 }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - pct);
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={T.border} strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={T.cyan} strokeWidth={stroke}
        strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 700ms ease", filter: `drop-shadow(0 0 6px ${T.cyan}66)` }} />
    </svg>
  );
}

function Bar({ value, cap, color }) {
  const pct = Math.min(1, (value || 0) / (cap || 1));
  return (
    <div className="w-full rounded-full overflow-hidden" style={{ height: 6, background: T.border }}>
      <div style={{ width: `${pct * 100}%`, height: "100%", background: color, borderRadius: 999, transition: "width 500ms ease" }} />
    </div>
  );
}

function ChartTip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div style={{ background: T.raised, border: `1px solid ${T.border}`, borderRadius: 8, padding: "6px 10px" }}>
      <div className="text-xs font-bold" style={{ color: T.text, ...num }}>{usd(payload[0].value)}</div>
    </div>
  );
}

const ACT = {
  rev: { c: T.gain, label: "SALE" },
  spend: { c: T.cyan, label: "SPEND" },
  dec: { c: T.muted, label: "DECISION" },
  res: { c: T.muted, label: "RESEARCH" },
  block: { c: T.loss, label: "BLOCKED" },
};

// ---- main ---------------------------------------------------------------
export default function CenturionDashboard() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [killArmed, setKillArmed] = useState(false);
  const [range, setRange] = useState("all");

  async function refresh() {
    try { setData(await fetchState()); setErr(null); }
    catch (e) { setErr(e.message); }
  }

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 3000);
    return () => clearInterval(id);
  }, []);

  async function act(fn) {
    setBusy(true);
    try { await fn(); await refresh(); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  if (!data) {
    return (
      <div style={{ background: T.bg, color: T.muted, minHeight: "100%", display: "flex",
        alignItems: "center", justifyContent: "center", fontFamily: "Inter, system-ui, sans-serif" }}>
        <div className="flex items-center gap-2">
          <Activity size={18} color={T.cyan} />
          {err ? `Can't reach Centurion: ${err}` : "Connecting to Centurion…"}
        </div>
      </div>
    );
  }

  const {
    systemState, mode, balance, funded, target, today, multiple, missionPct,
    inflight, vel, history, strategies, activity, pending, system, uptimeDays,
    host, cycleMins,
  } = data;

  const running = systemState === "live";
  const stateColor = running ? T.gain : systemState === "paused" ? T.warn : T.loss;
  const stateLabel = running ? "LIVE" : systemState === "paused" ? "PAUSED" : "STOPPED";

  const deployed = useMemo(
    () => strategies.filter(s => s.enabled).reduce((a, s) => a + s.alloc, 0), [strategies]);
  const available = Math.max(0, +(balance - inflight).toFixed(2));
  const chartData = range === "7d" ? history.slice(-7) : history;
  const donut = [
    { name: "Available", value: available, color: T.dim },
    { name: "Deployed", value: deployed, color: T.cyan },
    { name: "In flight", value: inflight, color: T.warn },
  ];

  const setMode = (m) => act(() => control("autonomy", { level: m }));
  const togglePause = () => act(() => control(running ? "pause" : "resume"));
  const approve = (p, ok) => act(() => control(ok ? "approve" : "reject", { id: p.id }));
  const toggleStrategy = (s) => act(() => control("strategy", { name: s.id, enabled: !s.enabled }));
  function doKill() {
    if (!killArmed) { setKillArmed(true); return; }
    setKillArmed(false);
    act(() => control("pause", { reason: "emergency stop (operator)" }));
  }

  const hbAgo = system.heartbeat;
  const uptimeStr = `${Math.floor(uptimeDays)}d ${Math.floor((uptimeDays % 1) * 24)}h`;

  return (
    <div style={{ background: T.bg, color: T.text, minHeight: "100%", fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}>
      <style>{`
        @keyframes pulse { 0%{opacity:1;transform:scale(1)} 50%{opacity:.35;transform:scale(.75)} 100%{opacity:1;transform:scale(1)} }
        .livedot{animation:pulse 1.6s ease-in-out infinite}
        .feedline{animation:slidein .35s ease}
        @keyframes slidein{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
        ::-webkit-scrollbar{width:8px;height:8px}
        ::-webkit-scrollbar-thumb{background:${T.border};border-radius:8px}
        @media (prefers-reduced-motion: reduce){.livedot,.feedline{animation:none}}
      `}</style>

      <div className="mx-auto p-4 lg:p-6" style={{ maxWidth: 1320 }}>
        {err && (
          <div className="mb-3 px-4 py-2 rounded-lg text-sm" style={{ background: `${T.loss}22`, border: `1px solid ${T.loss}55`, color: T.loss }}>
            {err}
          </div>
        )}

        {/* top bar */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center" style={{ width: 38, height: 38, borderRadius: 10, background: T.raised, border: `1px solid ${T.border}` }}>
              <Activity size={20} color={T.cyan} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-black tracking-tight">CENTURION</span>
                <span className="livedot" style={{ width: 8, height: 8, borderRadius: 999, background: stateColor, boxShadow: `0 0 8px ${stateColor}` }} />
                <span className="text-xs font-bold tracking-widest" style={{ color: stateColor }}>{stateLabel}</span>
              </div>
              <div className="text-xs" style={{ color: T.dim, ...mono }}>uptime {uptimeStr} · host {host} · cycle {cycleMins}m</div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex rounded-lg overflow-hidden" style={{ border: `1px solid ${T.border}` }}>
              {["full", "guarded", "review"].map(m => (
                <button key={m} onClick={() => setMode(m)} disabled={busy}
                  className="text-xs font-bold uppercase tracking-wider px-3 py-2 transition"
                  style={{ background: mode === m ? T.cyan : "transparent", color: mode === m ? T.bg : T.muted }}>
                  {m}
                </button>
              ))}
            </div>
            <button onClick={togglePause} disabled={busy}
              className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider px-3 py-2 rounded-lg transition"
              style={{ background: T.raised, border: `1px solid ${T.border}`, color: T.text }}>
              {running ? <Pause size={14} /> : <Play size={14} />}{running ? "Pause" : "Resume"}
            </button>
            <button onClick={doKill} disabled={busy}
              className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider px-3 py-2 rounded-lg transition"
              style={{ background: killArmed ? T.loss : "transparent", border: `1px solid ${T.loss}`, color: killArmed ? T.bg : T.loss }}>
              <Power size={14} />{killArmed ? "Confirm stop" : "Emergency stop"}
            </button>
          </div>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
          <Kpi label="Balance" value={usd(balance)} sub={`from ${usd(funded)} funded`} accent={T.text} />
          <Kpi label="Multiple" value={`${multiple}x`} sub="return on capital" accent={T.cyan} />
          <Kpi label="Today" value={usd(today, true)} sub="net so far" accent={today >= 0 ? T.gain : T.loss}
            icon={today >= 0 ? <TrendingUp size={14} color={T.gain} /> : <TrendingDown size={14} color={T.loss} />} />
          <Kpi label="Deployed" value={usd(deployed)} sub={`${usd(available)} available`} accent={T.text} />
        </div>

        {/* approval queue (only below full autonomy) */}
        {mode !== "full" && (
          <div className="mb-3" style={{ background: T.panel, border: `1px solid ${T.warn}55`, borderRadius: 16 }}>
            <div className="flex items-center gap-2 px-4 pt-3 pb-2">
              <ShieldCheck size={15} color={T.warn} />
              <span className="text-xs font-bold uppercase tracking-widest" style={{ color: T.warn }}>
                Awaiting approval · {mode} mode
              </span>
            </div>
            <div className="px-4 pb-4 space-y-2">
              {pending.length === 0 && <div className="text-sm" style={{ color: T.dim }}>Nothing waiting. The agent is acting within your set limits.</div>}
              {pending.map(p => (
                <div key={p.id} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg" style={{ background: T.raised }}>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">{p.m}</div>
                    <div className="text-xs" style={{ color: T.muted, ...num }}>
                      cost {usd(p.cost)} · est. return {usd(p.ev, true)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => approve(p, true)} disabled={busy} className="flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-md" style={{ background: T.gain, color: T.bg }}><Check size={13} />Approve</button>
                    <button onClick={() => approve(p, false)} disabled={busy} className="flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-md" style={{ background: "transparent", border: `1px solid ${T.border}`, color: T.muted }}><X size={13} />Reject</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* mission chart + capital */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 mb-3">
          <Panel span="xl:col-span-2" title={`Mission · ${usd(funded)} to ${usd(target)}`} icon={<TrendingUp size={15} color={T.cyan} />}
            right={
              <div className="flex rounded-md overflow-hidden" style={{ border: `1px solid ${T.border}` }}>
                {["7d", "all"].map(r => (
                  <button key={r} onClick={() => setRange(r)} className="text-xs font-bold uppercase px-2.5 py-1"
                    style={{ background: range === r ? T.border : "transparent", color: range === r ? T.text : T.dim }}>{r}</button>
                ))}
              </div>
            }>
            <div style={{ height: 232 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={T.cyan} stopOpacity={0.5} />
                      <stop offset="100%" stopColor={T.cyan} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="day" tick={{ fill: T.dim, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={d => `${d}`} />
                  <YAxis tick={{ fill: T.dim, fontSize: 11 }} axisLine={false} tickLine={false} domain={[0, target]} tickFormatter={v => `$${v}`} />
                  <Tooltip content={<ChartTip />} cursor={{ stroke: T.border }} />
                  <ReferenceLine y={target} stroke={T.gain} strokeDasharray="4 4" strokeOpacity={0.6}
                    label={{ value: "goal", fill: T.gain, fontSize: 10, position: "insideTopRight" }} />
                  <Area type="monotone" dataKey="v" stroke={T.cyan} strokeWidth={2.5} fill="url(#g)"
                    dot={false} activeDot={{ r: 4, fill: T.cyan, stroke: T.bg, strokeWidth: 2 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel title="Where the money is" icon={<Gauge size={15} color={T.cyan} />}>
            <div className="flex items-center gap-4">
              <div className="relative" style={{ width: 132, height: 132 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={donut} dataKey="value" innerRadius={42} outerRadius={62} paddingAngle={2} stroke="none">
                      {donut.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-lg font-black" style={num}>{usd(balance)}</span>
                  <span className="text-xs" style={{ color: T.dim }}>total</span>
                </div>
              </div>
              <div className="flex-1 space-y-2">
                {donut.map((d, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span style={{ width: 9, height: 9, borderRadius: 2, background: d.color }} />
                      <span className="text-sm" style={{ color: T.muted }}>{d.name}</span>
                    </div>
                    <span className="text-sm font-bold" style={num}>{usd(d.value)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between mt-4 pt-3" style={{ borderTop: `1px solid ${T.border}` }}>
              <div>
                <div className="text-xs uppercase tracking-widest" style={{ color: T.dim }}>Downside floor</div>
                <div className="text-sm font-bold" style={{ color: T.gain }}>{usd(funded)} funded · protected</div>
              </div>
              <div className="flex items-center gap-2">
                <Ring pct={missionPct} size={56} stroke={7} />
                <div>
                  <div className="text-sm font-black" style={num}>{Math.round(missionPct * 100)}%</div>
                  <div className="text-xs" style={{ color: T.dim }}>to goal</div>
                </div>
              </div>
            </div>
          </Panel>
        </div>

        {/* strategies */}
        <Panel title="Strategies · what it's doing and how each is paying" icon={<Cpu size={15} color={T.cyan} />}>
          <div className="hidden lg:grid grid-cols-12 gap-3 px-2 pb-2 text-xs uppercase tracking-widest" style={{ color: T.dim }}>
            <div className="col-span-3">Strategy</div>
            <div className="col-span-3">Capital allocated</div>
            <div className="col-span-2 text-right">Return</div>
            <div className="col-span-1 text-right">Win</div>
            <div className="col-span-2">Trend</div>
            <div className="col-span-1 text-right">On</div>
          </div>
          <div className="space-y-1">
            {strategies.map(s => {
              const roi = s.alloc ? (s.ret / s.alloc) * 100 : 0;
              const pos = s.ret >= 0;
              const maxAlloc = Math.max(1, ...strategies.map(x => x.alloc));
              const allocPct = s.alloc / maxAlloc;
              return (
                <div key={s.id} className="grid grid-cols-12 gap-3 items-center px-2 py-2.5 rounded-lg"
                  style={{ background: T.raised, opacity: s.enabled ? 1 : 0.45 }}>
                  <div className="col-span-6 lg:col-span-3 min-w-0">
                    <div className="text-sm font-bold truncate">{s.name}</div>
                    <div className="text-xs" style={{ color: s.note === "throttled" || s.note === "off" ? T.warn : T.dim }}>{s.note} · {s.trades} trades</div>
                  </div>
                  <div className="hidden lg:block col-span-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs" style={{ color: T.muted, ...num }}>{usd(s.alloc)}</span>
                    </div>
                    <Bar value={allocPct} cap={1} color={s.enabled ? T.cyan : T.dim} />
                  </div>
                  <div className="col-span-3 lg:col-span-2 text-right">
                    <div className="text-sm font-black" style={{ color: pos ? T.gain : T.loss, ...num }}>{usd(s.ret, true)}</div>
                    <div className="text-xs" style={{ color: T.dim, ...num }}>{pos ? "+" : ""}{roi.toFixed(0)}% roi</div>
                  </div>
                  <div className="hidden lg:block col-span-1 text-right text-sm font-bold" style={num}>{Math.round(s.win * 100)}%</div>
                  <div className="hidden lg:block col-span-2"><Spark data={s.spark} color={pos ? T.gain : T.loss} /></div>
                  <div className="col-span-3 lg:col-span-1 flex justify-end">
                    <button onClick={() => toggleStrategy(s)} disabled={busy} aria-label={`toggle ${s.name}`}
                      style={{ width: 38, height: 22, borderRadius: 999, background: s.enabled ? T.cyanDeep : T.border, position: "relative", transition: "background 200ms" }}>
                      <span style={{ position: "absolute", top: 3, left: s.enabled ? 19 : 3, width: 16, height: 16, borderRadius: 999, background: s.enabled ? T.cyan : T.dim, transition: "left 200ms" }} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="text-xs mt-3" style={{ color: T.dim }}>
            The Decision Core concentrates capital on what's working and throttles what isn't. Toggling a strategy off returns its capital to available.
          </div>
        </Panel>

        {/* activity + health */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mt-3">
          <Panel span="lg:col-span-2" title="Live activity" icon={<Radio size={15} color={T.cyan} />}
            right={<span className="text-xs" style={{ color: T.dim, ...mono }}>{running ? "streaming" : "paused"}</span>}>
            <div className="overflow-y-auto" style={{ maxHeight: 320 }}>
              {activity.length === 0 && <div className="text-sm py-6 text-center" style={{ color: T.dim }}>No activity yet.</div>}
              {activity.map((a, i) => {
                const meta = ACT[a.k] || ACT.dec;
                return (
                  <div key={i} className="feedline flex items-center gap-3 py-2" style={{ borderBottom: `1px solid ${T.border}` }}>
                    <span className="text-xs shrink-0" style={{ color: T.dim, ...mono }}>{a.t}</span>
                    <span className="text-xs font-bold shrink-0" style={{ color: meta.c, width: 72 }}>{meta.label}</span>
                    <span className="text-sm flex-1 min-w-0 truncate" style={{ color: T.text }}>{a.m}</span>
                    {a.v != null && <span className="text-sm font-bold shrink-0" style={{ color: a.v >= 0 ? T.gain : T.cyan, ...num }}>{usd(a.v, true)}</span>}
                  </div>
                );
              })}
            </div>
          </Panel>

          <div className="space-y-3">
            <Panel title="Spend velocity" icon={<Zap size={15} color={T.cyan} />}>
              <div className="space-y-3">
                <Velo label="This hour" v={vel.hour} cap={vel.hourCap} />
                <Velo label="Today" v={vel.day} cap={vel.dayCap} />
              </div>
              <div className="text-xs mt-3" style={{ color: T.dim }}>Caps stop it draining the budget in one bad hour while you sleep.</div>
            </Panel>

            <Panel title="System" icon={<Server size={15} color={T.cyan} />}>
              <Row k="Heartbeat" v={<span style={{ color: hbAgo != null && hbAgo < 1200 ? T.gain : T.warn, ...mono }}>{hbAgo != null ? `${hbAgo}s ago` : "—"}</span>} />
              <Row k="Last cycle" v={system.lastCycleAgo != null ? `${system.lastCycleAgo}s ago` : "—"} />
              <Row k="Model" v={system.model} />
              <Row k="Compute budget" v={<span style={num}>{usd(system.computeUsed)} / {usd(system.computeBudget)}</span>} />
              <Row k="Decision quality" v={<span style={{ color: T.muted, fontSize: 12 }}>{system.calibration}</span>} />
              <div className="flex items-center justify-between py-1.5">
                <span className="text-sm" style={{ color: T.muted }}>Guardrails</span>
                <span className="flex items-center gap-1.5 text-sm font-bold" style={{ color: T.gain }}>
                  <ShieldCheck size={14} /> {system.blocks} blocked · {system.anomalies} anomalies
                </span>
              </div>
            </Panel>
          </div>
        </div>

        <div className="text-xs text-center mt-5" style={{ color: T.dim }}>
          Centurion runs on its own decision algorithm and a self-hosted model. No third-party AI service in the loop. Live data.
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, accent, icon }) {
  return (
    <div style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 16 }} className="p-4">
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-xs font-bold uppercase tracking-widest" style={{ color: T.dim }}>{label}</span>
        {icon}
      </div>
      <div className="text-3xl font-black tracking-tight leading-none" style={{ color: accent, ...num }}>{value}</div>
      <div className="text-xs mt-2" style={{ color: T.muted, ...num }}>{sub}</div>
    </div>
  );
}

function Velo({ label, v, cap }) {
  const over = (v || 0) / (cap || 1) > 0.8;
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm" style={{ color: T.muted }}>{label}</span>
        <span className="text-sm font-bold" style={{ color: over ? T.warn : T.text, ...num }}>{usd(v)} / {usd(cap)}</span>
      </div>
      <Bar value={v} cap={cap} color={over ? T.warn : T.cyan} />
    </div>
  );
}

function Row({ k, v }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm" style={{ color: T.muted }}>{k}</span>
      <span className="text-sm font-bold" style={{ color: T.text }}>{v}</span>
    </div>
  );
}
