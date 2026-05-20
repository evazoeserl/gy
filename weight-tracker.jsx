import { useState, useRef, useEffect, useCallback } from "react";

// ─── Constants ────────────────────────────────────────────────────────────────
const MONTHS = ["Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"];
const DAYS   = ["So","Mo","Di","Mi","Do","Fr","Sa"];
const INITIAL_GOAL_DATE = "2025-09-01";
const INITIAL_HEIGHT = 165; // cm

const INITIAL_DATA = [
  { date: "2024-02-19", weight: 63.9 },
  { date: "2024-03-01", weight: 63.2 },
  { date: "2024-03-15", weight: 62.4 },
  { date: "2024-04-01", weight: 61.1 },
  { date: "2024-04-20", weight: 60.3 },
  { date: "2024-05-10", weight: 59.4 },
  { date: "2024-06-01", weight: 58.8 },
  { date: "2024-06-15", weight: 57.9 },
  { date: "2024-07-01", weight: 57.2 },
  { date: "2024-07-20", weight: 56.8 },
  { date: "2024-08-05", weight: 57.5 },
  { date: "2024-08-20", weight: 56.3 },
  { date: "2024-09-05", weight: 55.9 },
  { date: "2024-09-20", weight: 55.2 },
  { date: "2024-10-09", weight: 55.6 },
  { date: "2024-10-25", weight: 56.1 },
  { date: "2024-11-10", weight: 57.0 },
  { date: "2024-11-28", weight: 56.4 },
  { date: "2024-12-15", weight: 57.8 },
  { date: "2025-01-05", weight: 58.2 },
  { date: "2025-01-20", weight: 59.1 },
  { date: "2025-02-02", weight: 57.0 },
  { date: "2025-02-15", weight: 57.8 },
  { date: "2025-03-01", weight: 57.4 },
  { date: "2025-03-20", weight: 57.0 },
];
const GOAL_WEIGHT = 53.0;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getDate().toString().padStart(2,"0")}.${MONTHS[d.getMonth()]}`;
}
function formatDateFull(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getDate().toString().padStart(2,"0")}.${MONTHS[d.getMonth()]}.${d.getFullYear()}`;
}
function weekday(dateStr) {
  return DAYS[new Date(dateStr + "T00:00:00").getDay()];
}
function daysBetween(a, b) {
  return (new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 86400000;
}
function addDays(dateStr, n) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0,10);
}
function bmi(weight, heightCm) {
  const h = heightCm / 100;
  return weight / (h * h);
}
function bmiLabel(b) {
  if (b < 18.5) return { label: "Untergewicht", color: "#60a5fa" };
  if (b < 25)   return { label: "Normalgewicht", color: "#4ade80" };
  if (b < 30)   return { label: "Übergewicht",   color: "#fbbf24" };
  return          { label: "Adipositas",          color: "#f87171" };
}
function movingAverage(data, w = 5) {
  return data.map((_, i) => {
    const sl = data.slice(Math.max(0, i - w + 1), i + 1);
    return sl.reduce((a, b) => a + b.weight, 0) / sl.length;
  });
}
function linearRegression(data) {
  const n = data.length;
  if (n < 2) return { slope: 0, intercept: data[0]?.weight ?? 0, values: data.map(d => d.weight) };
  const xs = data.map((_, i) => i);
  const ys = data.map(d => d.weight);
  const mx = xs.reduce((a,b) => a+b,0)/n;
  const my = ys.reduce((a,b) => a+b,0)/n;
  const slope = xs.reduce((a,x,i) => a+(x-mx)*(ys[i]-my),0) / xs.reduce((a,x) => a+(x-mx)**2,0);
  const intercept = my - slope*mx;
  return { slope, intercept, values: xs.map(x => slope*x+intercept) };
}

// ─── Chart ────────────────────────────────────────────────────────────────────
function WeightChart({ data, goal, goalDate, onQuickAdd }) {
  const wrapRef = useRef(null);
  const [tooltip, setTooltip] = useState(null);
  const [clickHint, setClickHint] = useState(null);
  const [dims, setDims] = useState({ w: 360, h: 220 });

  useEffect(() => {
    const obs = new ResizeObserver(entries => {
      const { width } = entries[0].contentRect;
      setDims({ w: width, h: Math.min(230, width * 0.56) });
    });
    if (wrapRef.current) obs.observe(wrapRef.current);
    return () => obs.disconnect();
  }, []);

  if (data.length < 2) return (
    <div style={{ color:"#334",textAlign:"center",padding:"40px 0",fontFamily:"monospace",fontSize:12 }}>
      Mindestens 2 Einträge für den Chart benötigt
    </div>
  );

  const pad = { t: 14, r: 36, b: 36, l: 38 };
  const cw = dims.w - pad.l - pad.r;
  const ch = dims.h - pad.t - pad.b;

  const weights = data.map(d => d.weight);
  const minW = Math.min(...weights, goal) - 1.5;
  const maxW = Math.max(...weights) + 1.5;

  const toX = i => (i / (data.length - 1)) * cw;
  const toY = w => ch - ((w - minW) / (maxW - minW)) * ch;
  const fromX = x => Math.round((x / cw) * (data.length - 1));

  const mavg = movingAverage(data, 5);
  const { values: trend } = linearRegression(data);
  const goalY = toY(goal);

  const pointsLine  = data.map((_, i) => `${toX(i)},${toY(data[i].weight)}`).join(" ");
  const pointsMavg  = mavg.map((v,i) => `${toX(i)},${toY(v)}`).join(" ");
  const pointsTrend = trend.map((v,i) => `${toX(i)},${toY(v)}`).join(" ");

  const labelCount = Math.min(5, data.length);
  const labelIdxs = Array.from({ length: labelCount }, (_, i) =>
    Math.round((i / (labelCount - 1)) * (data.length - 1))
  );

  const gridStep = 2;
  const gridVals = [];
  for (let v = Math.ceil(minW); v <= maxW; v += gridStep) gridVals.push(v);

  function handleSvgClick(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const rawX = (e.clientX - rect.left) * (dims.w / rect.width) - pad.l;
    const rawY = (e.clientY - rect.top) * (dims.h / rect.height) - pad.t;
    if (rawX < 0 || rawX > cw || rawY < 0 || rawY > ch) return;
    const idx = Math.max(0, Math.min(data.length - 1, fromX(rawX)));
    const w = minW + ((ch - rawY) / ch) * (maxW - minW);
    const rounded = Math.round(w * 10) / 10;
    setClickHint({ x: rawX + pad.l, y: rawY + pad.t, w: rounded, date: data[idx].date });
  }

  return (
    <div ref={wrapRef} style={{ position:"relative" }}>
      <div style={{ fontSize:9, color:"#2d4a66", letterSpacing:2, marginBottom:6 }}>
        CHART — Klick zum Schnelleintrag
      </div>
      <svg
        width="100%" height={dims.h}
        viewBox={`0 0 ${dims.w} ${dims.h}`}
        style={{ display:"block", overflow:"visible", cursor:"crosshair" }}
        onClick={handleSvgClick}
        onMouseLeave={() => setTooltip(null)}
      >
        <defs>
          <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.16"/>
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.01"/>
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2.5" result="cb"/>
            <feMerge><feMergeNode in="cb"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>

        <g transform={`translate(${pad.l},${pad.t})`}>
          {/* Grid */}
          {gridVals.map(v => (
            <g key={v}>
              <line x1={0} y1={toY(v)} x2={cw} y2={toY(v)} stroke="#1a2a3a" strokeWidth="1"/>
              <text x={-6} y={toY(v)+4} textAnchor="end" fontSize="9" fill="#3a5570" fontFamily="monospace">{v}</text>
            </g>
          ))}

          {/* Goal line */}
          <line x1={0} y1={goalY} x2={cw} y2={goalY}
            stroke="#f97316" strokeWidth="1.2" strokeDasharray="4,4" opacity="0.75"/>
          <text x={cw+4} y={goalY+4} fontSize="8" fill="#f97316" fontFamily="monospace">Ziel</text>

          {/* Area */}
          <polygon
            points={`${toX(0)},${ch} ${pointsLine} ${toX(data.length-1)},${ch}`}
            fill="url(#lineGrad)"/>

          {/* Trend */}
          <polyline points={pointsTrend} fill="none" stroke="#a78bfa"
            strokeWidth="1.5" strokeDasharray="5,3" opacity="0.6"/>

          {/* Moving avg */}
          <polyline points={pointsMavg} fill="none" stroke="#4ade80"
            strokeWidth="1.5" opacity="0.65"/>

          {/* Main line */}
          <polyline points={pointsLine} fill="none" stroke="#38bdf8"
            strokeWidth="2" filter="url(#glow)"/>

          {/* Points */}
          {data.map((d, i) => (
            <g key={i}
              onMouseEnter={() => setTooltip({ i, x: toX(i), y: toY(d.weight), d })}
              onMouseLeave={() => setTooltip(null)}
              style={{ cursor:"pointer" }}
              onClick={e => { e.stopPropagation(); setTooltip({ i, x: toX(i), y: toY(d.weight), d }); }}
            >
              <circle cx={toX(i)} cy={toY(d.weight)} r={9} fill="transparent"/>
              <circle cx={toX(i)} cy={toY(d.weight)} r={tooltip?.i===i ? 4 : 2.5}
                fill={tooltip?.i===i ? "#fff" : "#38bdf8"}
                stroke={tooltip?.i===i ? "#38bdf8" : "none"} strokeWidth="1.5"/>
            </g>
          ))}

          {/* Tooltip */}
          {tooltip && (() => {
            const tx = tooltip.x > cw - 68 ? tooltip.x - 76 : tooltip.x + 8;
            const d = tooltip.d;
            return (
              <g>
                <rect x={tx} y={tooltip.y - 34} width={72} height={32} rx={5}
                  fill="#091420" stroke="#38bdf8" strokeWidth="0.8" opacity="0.97"/>
                <text x={tx+36} y={tooltip.y-22} textAnchor="middle" fontSize="8" fill="#4a7090" fontFamily="monospace">
                  {weekday(d.date)} {formatDate(d.date)}
                </text>
                <text x={tx+36} y={tooltip.y-10} textAnchor="middle" fontSize="11"
                  fill="#38bdf8" fontFamily="monospace" fontWeight="bold">
                  {d.weight.toFixed(1)} kg
                </text>
              </g>
            );
          })()}

          {/* X labels */}
          {labelIdxs.map(i => (
            <text key={i} x={toX(i)} y={ch+20} textAnchor="middle"
              fontSize="8.5" fill="#3a5570" fontFamily="monospace">
              {formatDate(data[i].date)}
            </text>
          ))}
        </g>

        {/* Click hint overlay */}
        {clickHint && (
          <g>
            <circle cx={clickHint.x} cy={clickHint.y} r={5} fill="#38bdf8" opacity="0.5"/>
            <rect x={clickHint.x - 50} y={clickHint.y - 44} width={100} height={40} rx={6}
              fill="#091420" stroke="#38bdf8" strokeWidth="0.8"/>
            <text x={clickHint.x} y={clickHint.y - 30} textAnchor="middle"
              fontSize="9" fill="#94b8d4" fontFamily="monospace">{weekday(clickHint.date)} {formatDate(clickHint.date)}</text>
            <text x={clickHint.x} y={clickHint.y - 18} textAnchor="middle"
              fontSize="11" fill="#38bdf8" fontFamily="monospace" fontWeight="bold">
              {clickHint.w.toFixed(1)} kg — speichern?
            </text>
          </g>
        )}
      </svg>

      {/* Quick-add confirm bar */}
      {clickHint && (
        <div style={{ display:"flex", gap:8, marginTop:8, justifyContent:"center" }}>
          <button onClick={() => { onQuickAdd(clickHint.date, clickHint.w); setClickHint(null); }}
            style={{ background:"#0c3a5e", border:"1px solid #38bdf8", borderRadius:8,
              color:"#38bdf8", padding:"6px 18px", fontSize:12, fontFamily:"monospace", cursor:"pointer" }}>
            ✓ Speichern
          </button>
          <button onClick={() => setClickHint(null)}
            style={{ background:"none", border:"1px solid #1a2a3a", borderRadius:8,
              color:"#3a5570", padding:"6px 14px", fontSize:12, fontFamily:"monospace", cursor:"pointer" }}>
            Abbrechen
          </button>
        </div>
      )}

      {/* Legend */}
      <div style={{ display:"flex", gap:12, justifyContent:"center", marginTop:10, flexWrap:"wrap" }}>
        {[
          { color:"#38bdf8", label:"Gewicht" },
          { color:"#4ade80", label:"Ø 5 Tage" },
          { color:"#a78bfa", dash:true, label:"Trend" },
          { color:"#f97316", dash:true, label:"Ziel" },
        ].map(({ color, label, dash }) => (
          <div key={label} style={{ display:"flex", alignItems:"center", gap:5 }}>
            <svg width="20" height="8">
              <line x1="0" y1="4" x2="20" y2="4" stroke={color} strokeWidth="2"
                strokeDasharray={dash ? "4,3" : "none"}/>
            </svg>
            <span style={{ fontSize:9, color:"#3a5570", fontFamily:"monospace" }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Analytics ────────────────────────────────────────────────────────────────
function Analytics({ data, goal, goalDate, height }) {
  if (data.length < 3) return null;

  const first = data[0];
  const last  = data[data.length - 1];
  const totalDays  = Math.max(1, daysBetween(first.date, last.date));
  const totalLoss  = first.weight - last.weight;
  const lossPerDay = totalLoss / totalDays;
  const lossPerWeek  = lossPerDay * 7;
  const lossPerMonth = lossPerDay * 30.44;

  // Forecast: days until goal at current rate
  let forecastDate = null;
  let forecastDays = null;
  if (lossPerDay > 0) {
    forecastDays = Math.round((last.weight - goal) / lossPerDay);
    forecastDate = addDays(last.date, forecastDays);
  }

  // Goal date pressure
  let goalDiff = null;
  let goalOnTrack = null;
  if (goalDate && forecastDate) {
    goalDiff = daysBetween(forecastDate, goalDate);
    goalOnTrack = goalDiff >= 0;
  }

  // BMI
  const curBmi = bmi(last.weight, height);
  const goalBmi = bmi(goal, height);
  const { label: bmiLbl, color: bmiClr } = bmiLabel(curBmi);

  const stat = (label, value, sub, color = "#e2f0ff") => (
    <div style={{ background:"#0a1520", borderRadius:10, padding:"10px 10px 8px",
      border:"1px solid #0f2235", textAlign:"center" }}>
      <div style={{ fontSize:8, color:"#2d4a66", letterSpacing:2, marginBottom:3 }}>{label}</div>
      <div style={{ fontSize:14, fontWeight:"500", color, lineHeight:1.2 }}>{value}</div>
      {sub && <div style={{ fontSize:9, color:"#2d4a66", marginTop:3 }}>{sub}</div>}
    </div>
  );

  return (
    <div style={{ marginBottom:12 }}>
      <div style={{ fontSize:9, color:"#2d4a66", letterSpacing:3, marginBottom:8 }}>ANALYSE</div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:8 }}>
        {stat("Ø / WOCHE",
          lossPerWeek > 0 ? `−${lossPerWeek.toFixed(2)} kg` : `+${Math.abs(lossPerWeek).toFixed(2)} kg`,
          "aktueller Schnitt",
          lossPerWeek > 0 ? "#4ade80" : "#f87171"
        )}
        {stat("Ø / MONAT",
          lossPerMonth > 0 ? `−${lossPerMonth.toFixed(1)} kg` : `+${Math.abs(lossPerMonth).toFixed(1)} kg`,
          "aktueller Schnitt",
          lossPerMonth > 0 ? "#4ade80" : "#f87171"
        )}
        {stat("GESAMT",
          totalLoss > 0 ? `−${totalLoss.toFixed(1)} kg` : `+${Math.abs(totalLoss).toFixed(1)} kg`,
          `in ${totalDays} Tagen`,
          totalLoss > 0 ? "#4ade80" : "#f87171"
        )}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:8 }}>
        {/* Forecast */}
        <div style={{ background:"#0a1520", borderRadius:10, padding:"10px 10px 8px",
          border:"1px solid #0f2235", gridColumn:"1 / -1" }}>
          <div style={{ fontSize:8, color:"#2d4a66", letterSpacing:2, marginBottom:4 }}>HOCHRECHNUNG BEI AKTUELLEM TEMPO</div>
          {lossPerDay > 0 ? (
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div>
                <span style={{ fontSize:15, color:"#a78bfa", fontWeight:"500" }}>
                  {formatDateFull(forecastDate)}
                </span>
                <span style={{ fontSize:9, color:"#3a5570", marginLeft:8 }}>
                  (in {forecastDays} Tagen)
                </span>
              </div>
              {goalDate && (
                <div style={{ fontSize:10, color: goalOnTrack ? "#4ade80" : "#f87171",
                  background: goalOnTrack ? "#0a2a18" : "#2a0a0a",
                  border: `1px solid ${goalOnTrack ? "#1a4a28" : "#4a1a1a"}`,
                  borderRadius:6, padding:"3px 8px" }}>
                  {goalOnTrack
                    ? `✓ ${Math.round(goalDiff)} Tage früher`
                    : `✗ ${Math.round(Math.abs(goalDiff))} Tage zu spät`}
                </div>
              )}
            </div>
          ) : (
            <div style={{ fontSize:12, color:"#f87171" }}>Gewicht steigt — kein Zielerreichungsdatum berechenbar</div>
          )}
        </div>

        {/* BMI */}
        <div style={{ background:"#0a1520", borderRadius:10, padding:"10px 10px 8px",
          border:"1px solid #0f2235" }}>
          <div style={{ fontSize:8, color:"#2d4a66", letterSpacing:2, marginBottom:4 }}>BMI AKTUELL</div>
          <div style={{ fontSize:18, color:bmiClr, fontWeight:"500", lineHeight:1 }}>{curBmi.toFixed(1)}</div>
          <div style={{ fontSize:9, color:bmiClr, marginTop:2 }}>{bmiLbl}</div>
        </div>

        <div style={{ background:"#0a1520", borderRadius:10, padding:"10px 10px 8px",
          border:"1px solid #0f2235" }}>
          <div style={{ fontSize:8, color:"#2d4a66", letterSpacing:2, marginBottom:4 }}>BMI BEI ZIEL</div>
          <div style={{ fontSize:18, color: bmiLabel(goalBmi).color, fontWeight:"500", lineHeight:1 }}>
            {goalBmi.toFixed(1)}
          </div>
          <div style={{ fontSize:9, color: bmiLabel(goalBmi).color, marginTop:2 }}>{bmiLabel(goalBmi).label}</div>
        </div>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function WeightTracker() {
  const [data, setData] = useState(
    [...INITIAL_DATA].sort((a,b) => a.date.localeCompare(b.date))
  );
  const [goal]       = useState(GOAL_WEIGHT);
  const [goalDate, setGoalDate]   = useState(INITIAL_GOAL_DATE);
  const [height, setHeight]       = useState(INITIAL_HEIGHT);
  const [newEntry, setNewEntry]   = useState({ date: new Date().toISOString().slice(0,10), weight:"" });
  const [showLog,  setShowLog]    = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [editIdx,  setEditIdx]    = useState(null);
  const [editVal,  setEditVal]    = useState("");

  const sorted   = [...data].sort((a,b) => a.date.localeCompare(b.date));
  const first    = sorted[0];
  const last     = sorted[sorted.length - 1];
  const startW   = first?.weight ?? 0;
  const current  = last?.weight  ?? 0;
  const change   = current - startW;
  const remaining = current - goal;
  const pct = Math.min(100, Math.max(0, ((startW - current) / (startW - goal)) * 100));

  const addEntry = useCallback(() => {
    const w = parseFloat(newEntry.weight);
    if (!newEntry.date || isNaN(w) || w < 20 || w > 300) return;
    setData(prev => {
      const filtered = prev.filter(d => d.date !== newEntry.date);
      return [...filtered, { date: newEntry.date, weight: w }]
        .sort((a,b) => a.date.localeCompare(b.date));
    });
    setNewEntry(p => ({ ...p, weight:"" }));
  }, [newEntry]);

  const quickAdd = useCallback((date, weight) => {
    setData(prev => {
      const filtered = prev.filter(d => d.date !== date);
      return [...filtered, { date, weight }].sort((a,b) => a.date.localeCompare(b.date));
    });
  }, []);

  const deleteEntry = useCallback(i => {
    setData(prev => prev.filter((_,idx) => idx !== i));
  }, []);

  return (
    <div style={{
      minHeight:"100vh", background:"#060d14",
      display:"flex", justifyContent:"center", alignItems:"flex-start",
      padding:"24px 12px", fontFamily:"'DM Mono','Courier New',monospace",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Syne:wght@600;800&display=swap');
        * { box-sizing:border-box; }
        input[type=number]::-webkit-inner-spin-button { -webkit-appearance:none; }
        input[type=number] { -moz-appearance:textfield; }
        ::-webkit-scrollbar { width:4px; }
        ::-webkit-scrollbar-track { background:#0a1520; }
        ::-webkit-scrollbar-thumb { background:#1e3a5f; border-radius:4px; }
        .btn { transition:all 0.15s; }
        .btn:hover { opacity:0.85; transform:translateY(-1px); }
        .btn:active { transform:translateY(0); }
        .log-row:hover { background:#0d1e2e !important; }
        input[type=date]::-webkit-calendar-picker-indicator { filter:invert(0.4); }
      `}</style>

      <div style={{ width:"100%", maxWidth:440 }}>

        {/* Header */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", marginBottom:18 }}>
          <div>
            <div style={{ fontSize:10, letterSpacing:4, color:"#1e5f8c", textTransform:"uppercase", marginBottom:3 }}>
              Gewichtsverlauf
            </div>
            <div style={{ fontSize:26, fontFamily:"'Syne',sans-serif", fontWeight:800, color:"#e2f0ff", lineHeight:1 }}>
              Tracker
            </div>
          </div>
          <button className="btn" onClick={() => setShowSettings(v => !v)} style={{
            background:"#0a1520", border:"1px solid #0f2235", borderRadius:8,
            color:"#2d4a66", padding:"7px 12px", fontSize:14, cursor:"pointer"
          }}>⚙</button>
        </div>

        {/* Settings panel */}
        {showSettings && (
          <div style={{ background:"#0a1520", borderRadius:12, padding:"12px 14px",
            border:"1px solid #1a3550", marginBottom:12 }}>
            <div style={{ fontSize:9, color:"#2d4a66", letterSpacing:3, marginBottom:10 }}>EINSTELLUNGEN</div>
            <div style={{ display:"flex", gap:10, alignItems:"center", marginBottom:10 }}>
              <label style={{ fontSize:10, color:"#4a6080", minWidth:80 }}>Körpergröße</label>
              <input type="number" value={height} onChange={e => setHeight(+e.target.value)}
                style={{ width:72, background:"#060d14", border:"1px solid #1a3550",
                  borderRadius:7, color:"#38bdf8", padding:"6px 8px",
                  fontSize:13, fontFamily:"inherit", outline:"none", textAlign:"center" }}/>
              <span style={{ fontSize:10, color:"#3a5570" }}>cm</span>
            </div>
            <div style={{ display:"flex", gap:10, alignItems:"center" }}>
              <label style={{ fontSize:10, color:"#4a6080", minWidth:80 }}>Zieldatum</label>
              <input type="date" value={goalDate} onChange={e => setGoalDate(e.target.value)}
                style={{ flex:1, background:"#060d14", border:"1px solid #1a3550",
                  borderRadius:7, color:"#f97316", padding:"6px 8px",
                  fontSize:12, fontFamily:"inherit", outline:"none" }}/>
            </div>
          </div>
        )}

        {/* Stats: Start / Aktuell / Ziel */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:14 }}>
          {[
            { label:"START",   value:`${startW.toFixed(1)} kg`,   color:"#4a6080",  date: first?.date,  sub: first ? weekday(first.date) : null },
            { label:"AKTUELL", value:`${current.toFixed(1)} kg`,  color:"#38bdf8",  date: last?.date,   sub: last  ? weekday(last.date)  : null },
            { label:"ZIEL",    value:`${goal.toFixed(1)} kg`,     color:"#f97316",  date: goalDate,     sub: goalDate ? weekday(goalDate) : null },
          ].map(({ label, value, color, date, sub }) => (
            <div key={label} style={{ background:"#0a1520", borderRadius:10,
              padding:"10px 8px", textAlign:"center", border:"1px solid #0f2235" }}>
              <div style={{ fontSize:8, color:"#2d4a66", letterSpacing:2, marginBottom:3 }}>{label}</div>
              <div style={{ fontSize:15, fontWeight:"500", color }}>{value}</div>
              {date && <div style={{ fontSize:9, color:"#1e3a55", marginTop:3 }}>{formatDate(date)}</div>}
              {sub  && <div style={{ fontSize:8, color:"#1a2d42", marginTop:1 }}>{sub}</div>}
            </div>
          ))}
        </div>

        {/* Chart */}
        <div style={{ background:"#0a1520", borderRadius:14, padding:"14px 12px 10px",
          border:"1px solid #0f2235", marginBottom:12 }}>
          <WeightChart data={sorted} goal={goal} goalDate={goalDate} onQuickAdd={quickAdd}/>
        </div>

        {/* Progress */}
        <div style={{ background:"#0a1520", borderRadius:10, padding:"12px 14px",
          border:"1px solid #0f2235", marginBottom:12 }}>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:7 }}>
            <span style={{ fontSize:10, color:"#4a6080" }}>
              Veränderung:{" "}
              <span style={{ color: change < 0 ? "#4ade80" : "#f87171" }}>
                {change > 0 ? "+" : ""}{change.toFixed(1)} kg
              </span>
            </span>
            <span style={{ fontSize:10, color:"#4a6080" }}>
              Verbleibend: <span style={{ color:"#38bdf8" }}>{remaining.toFixed(1)} kg</span>
            </span>
          </div>
          <div style={{ background:"#0f2235", borderRadius:6, height:7, overflow:"hidden" }}>
            <div style={{ height:"100%", width:`${pct}%`,
              background:"linear-gradient(90deg,#0ea5e9,#4ade80)",
              borderRadius:6, transition:"width 0.6s ease" }}/>
          </div>
          <div style={{ fontSize:9, color:"#2d4a66", marginTop:5, textAlign:"right" }}>
            {pct.toFixed(0)}% zum Ziel
          </div>
        </div>

        {/* Analytics */}
        <Analytics data={sorted} goal={goal} goalDate={goalDate} height={height}/>

        {/* Add entry */}
        <div style={{ background:"#0a1520", borderRadius:12, padding:"12px 14px",
          border:"1px solid #0f2235", marginBottom:12 }}>
          <div style={{ fontSize:9, color:"#2d4a66", letterSpacing:3, marginBottom:8 }}>NEUER EINTRAG</div>
          <div style={{ display:"flex", gap:8 }}>
            <input type="date" value={newEntry.date}
              onChange={e => setNewEntry(p => ({ ...p, date: e.target.value }))}
              style={{ flex:1, background:"#060d14", border:"1px solid #1a3550",
                borderRadius:8, color:"#94b8d4", padding:"8px 10px",
                fontSize:12, fontFamily:"inherit", outline:"none" }}/>
            <input type="number" step="0.1" placeholder="kg" value={newEntry.weight}
              onChange={e => setNewEntry(p => ({ ...p, weight: e.target.value }))}
              onKeyDown={e => e.key === "Enter" && addEntry()}
              style={{ width:70, background:"#060d14", border:"1px solid #1a3550",
                borderRadius:8, color:"#38bdf8", padding:"8px 10px",
                fontSize:14, fontFamily:"inherit", outline:"none", textAlign:"center" }}/>
            <button className="btn" onClick={addEntry} style={{
              background:"#0c3a5e", border:"1px solid #1a5a8f",
              borderRadius:8, color:"#38bdf8", padding:"8px 14px",
              fontSize:18, cursor:"pointer", lineHeight:1 }}>+</button>
          </div>
          <div style={{ fontSize:9, color:"#1a2d42", marginTop:6 }}>
            Tipp: Im Chart klicken für Schnelleintrag
          </div>
        </div>

        {/* Log */}
        <button className="btn" onClick={() => setShowLog(v => !v)} style={{
          width:"100%", background:"#080f18", border:"1px solid #0f2235",
          borderRadius:10, color:"#2d4a66", padding:"9px",
          fontSize:10, letterSpacing:3, cursor:"pointer", marginBottom:8 }}>
          {showLog ? "▲ VERLAUF AUSBLENDEN" : "▼ VERLAUF ANZEIGEN"} ({sorted.length} Einträge)
        </button>

        {showLog && (
          <div style={{ background:"#0a1520", borderRadius:12,
            border:"1px solid #0f2235", maxHeight:280, overflowY:"auto" }}>
            {[...sorted].reverse().map((d, revI) => {
              const i = sorted.length - 1 - revI;
              const prev = i > 0 ? sorted[i-1].weight : null;
              const diff = prev !== null ? d.weight - prev : null;
              return (
                <div key={d.date} className="log-row" style={{
                  display:"flex", alignItems:"center",
                  padding:"7px 14px", borderBottom:"1px solid #0c1c2c", gap:8 }}>
                  {editIdx === i ? (
                    <>
                      <input type="number" step="0.1" value={editVal}
                        onChange={e => setEditVal(e.target.value)}
                        onKeyDown={e => {
                          if (e.key==="Enter") {
                            const w = parseFloat(editVal);
                            if (!isNaN(w)) setData(prev => prev.map((x,idx) => idx===i ? {...x,weight:w} : x));
                            setEditIdx(null);
                          }
                          if (e.key==="Escape") setEditIdx(null);
                        }}
                        autoFocus
                        style={{ width:70, background:"#0f2235", border:"1px solid #38bdf8",
                          borderRadius:6, color:"#38bdf8", padding:"3px 7px",
                          fontSize:13, fontFamily:"inherit" }}/>
                      <button onClick={() => {
                        const w = parseFloat(editVal);
                        if (!isNaN(w)) setData(prev => prev.map((x,idx) => idx===i ? {...x,weight:w} : x));
                        setEditIdx(null);
                      }} style={{ background:"none", border:"none", color:"#4ade80", cursor:"pointer", fontSize:14 }}>✓</button>
                    </>
                  ) : (
                    <>
                      <span style={{ fontSize:9, color:"#2d4a66", minWidth:20 }}>{weekday(d.date)}</span>
                      <span style={{ fontSize:10, color:"#2d4a66", flex:1 }}>{formatDate(d.date)}</span>
                      <span style={{ fontSize:13, color:"#38bdf8", minWidth:52 }}>{d.weight.toFixed(1)} kg</span>
                      {diff !== null && (
                        <span style={{ fontSize:10, minWidth:38, textAlign:"right",
                          color: diff<0 ? "#4ade80" : diff>0 ? "#f87171" : "#4a6080" }}>
                          {diff>0?"+":""}{diff.toFixed(1)}
                        </span>
                      )}
                      <button onClick={() => { setEditIdx(i); setEditVal(d.weight.toString()); }}
                        style={{ background:"none", border:"none", color:"#2d4a66", cursor:"pointer", fontSize:12 }}>✎</button>
                      <button onClick={() => deleteEntry(i)}
                        style={{ background:"none", border:"none", color:"#2d2d2d", cursor:"pointer", fontSize:12 }}>✕</button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
