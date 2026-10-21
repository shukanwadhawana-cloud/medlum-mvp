"use client";

import { useState } from "react";

type Series = { id: "axial" | "coronal" | "sagittal"; label: string; slices: number };

const SERIES: Series[] = [
  { id: "axial", label: "CT · Axial", slices: 24 },
  { id: "coronal", label: "CT · Coronal", slices: 18 },
  { id: "sagittal", label: "CT · Sagittal", slices: 18 },
];

function SyntheticSlice({
  series,
  slice,
  zoom,
  windowLevel,
}: {
  series: Series["id"];
  slice: number;
  zoom: number;
  windowLevel: number;
}) {
  const shape = Math.sin(slice * 0.31);
  const brightness = 1 + windowLevel / 150;
  const contrast = 1 + windowLevel / 180;
  const imageFilter = `brightness(${brightness}) contrast(${contrast})`;

  return (
    <svg
      viewBox="0 0 420 420"
      role="img"
      aria-label={`Synthetic ${series} image, slice ${slice}; demonstration only, not for diagnosis`}
      className="block h-auto w-full"
    >
      <defs>
        <radialGradient id="synthetic-tissue" cx="45%" cy="40%" r="65%">
          <stop offset="0%" stopColor="#d8dce0" />
          <stop offset="68%" stopColor="#9199a1" />
          <stop offset="100%" stopColor="#353b42" />
        </radialGradient>
        <radialGradient id="synthetic-bone">
          <stop offset="0%" stopColor="#fff" />
          <stop offset="75%" stopColor="#d5dae0" />
          <stop offset="100%" stopColor="#737b84" />
        </radialGradient>
        <linearGradient id="synthetic-warning" x1="0" x2="1">
          <stop offset="0%" stopColor="#831843" stopOpacity=".98" />
          <stop offset="100%" stopColor="#9f1239" stopOpacity=".92" />
        </linearGradient>
      </defs>
      <rect width="420" height="420" fill="#03060b" />
      <g transform={`translate(210 210) scale(${zoom}) translate(-210 -210)`} style={{ filter: imageFilter }}>
        {series === "axial" ? (
          <>
            <ellipse cx="210" cy="210" rx={124 + shape * 3} ry={154 - shape * 2} fill="url(#synthetic-tissue)" stroke="#e5e7eb" strokeOpacity=".3" strokeWidth="3" />
            <ellipse cx="210" cy="206" rx="110" ry="139" fill="#9ba2aa" opacity=".8" />
            <path d={`M143 ${147 + shape * 3} C115 125 95 165 108 221 C118 260 144 282 164 264 C180 247 168 201 167 180 C166 161 159 151 143 147Z`} fill="#111821" stroke="#d1d5db" strokeOpacity=".45" strokeWidth="3" />
            <path d={`M277 ${147 - shape * 3} C305 125 325 165 312 221 C302 260 276 282 256 264 C240 247 252 201 253 180 C254 161 261 151 277 147Z`} fill="#111821" stroke="#d1d5db" strokeOpacity=".45" strokeWidth="3" />
            <ellipse cx={210 + shape * 5} cy="225" rx="43" ry="54" fill="#555e68" stroke="#e7ebef" strokeOpacity=".7" strokeWidth="4" />
            <ellipse cx="210" cy="328" rx="23" ry="25" fill="url(#synthetic-bone)" />
            <ellipse cx="210" cy="328" rx="9" ry="10" fill="#343b44" />
            <path d="M180 115 Q210 96 240 115 M178 294 Q210 309 242 294" fill="none" stroke="#edf0f3" strokeOpacity=".55" strokeWidth="5" />
            {Array.from({ length: 7 }, (_, i) => (
              <g key={i} opacity=".42" stroke="#f3f4f6" strokeWidth="2" fill="none">
                <path d={`M131 ${157 + i * 18} Q160 ${145 + i * 17} 173 ${167 + i * 18}`} />
                <path d={`M289 ${157 + i * 18} Q260 ${145 + i * 17} 247 ${167 + i * 18}`} />
              </g>
            ))}
          </>
        ) : series === "coronal" ? (
          <>
            <ellipse cx="210" cy="209" rx="120" ry="161" fill="url(#synthetic-tissue)" stroke="#dbe1e6" strokeOpacity=".35" strokeWidth="3" />
            <path d="M145 88 Q132 130 149 177 L168 253 Q183 274 192 251 L191 108Z" fill="#111821" stroke="#d1d5db" strokeOpacity=".4" strokeWidth="3" />
            <path d="M275 88 Q288 130 271 177 L252 253 Q237 274 228 251 L229 108Z" fill="#111821" stroke="#d1d5db" strokeOpacity=".4" strokeWidth="3" />
            <path d={`M192 150 Q210 ${135 + shape * 5} 228 150 L238 221 Q210 253 182 221Z`} fill="#626b75" stroke="#e5e7eb" strokeOpacity=".55" strokeWidth="3" />
            <path d="M207 87 L207 309 M213 87 L213 309" stroke="#f8fafc" strokeOpacity=".48" strokeWidth="4" />
            {Array.from({ length: 8 }, (_, i) => (
              <g key={i} opacity=".35" stroke="#f8fafc" strokeWidth="3" fill="none">
                <path d={`M112 ${113 + i * 23} Q155 ${100 + i * 23} 188 ${121 + i * 23}`} />
                <path d={`M308 ${113 + i * 23} Q265 ${100 + i * 23} 232 ${121 + i * 23}`} />
              </g>
            ))}
          </>
        ) : (
          <>
            <path d="M153 54 Q117 100 140 160 L159 235 Q178 279 172 325 L244 325 Q243 275 267 231 L283 143 Q295 89 258 54 Q205 31 153 54Z" fill="url(#synthetic-tissue)" stroke="#e5e7eb" strokeOpacity=".35" strokeWidth="3" />
            <path d="M183 76 Q162 120 185 176 L204 215 L196 292 L220 292 L215 203 L233 160 Q249 112 229 76Z" fill="#151c25" stroke="#d1d5db" strokeOpacity=".5" strokeWidth="3" />
            <path d="M206 85 L211 292" stroke="#f9fafb" strokeOpacity=".68" strokeWidth="6" />
            {Array.from({ length: 9 }, (_, i) => (
              <ellipse key={i} cx="208" cy={94 + i * 23} rx={19 + Math.sin(i * 0.4) * 3} ry="5.5" fill="url(#synthetic-bone)" opacity=".85" />
            ))}
          </>
        )}
        <path d="M210 48 V372 M48 210 H372" stroke="#e5e7eb" strokeOpacity=".17" strokeDasharray="5 7" />
      </g>
      <rect x="0" y="0" width="420" height="31" fill="url(#synthetic-warning)" />
      <text x="12" y="20" fill="#fff" fontSize="11" fontWeight="700" letterSpacing="1.25">SYNTHETIC DEMO · NOT FOR DIAGNOSIS</text>
      <text x="12" y="402" fill="#cbd5e1" fontSize="11">DEMO STUDY SD-0001</text>
      <text x="408" y="402" textAnchor="end" fill="#cbd5e1" fontSize="11">{series.toUpperCase()} · {String(slice).padStart(2, "0")}</text>
    </svg>
  );
}

export default function PacsFreeSyntheticDemo() {
  const [open, setOpen] = useState(false);
  const [seriesId, setSeriesId] = useState<Series["id"]>("axial");
  const [slice, setSlice] = useState(12);
  const [zoom, setZoom] = useState(1);
  const [windowLevel, setWindowLevel] = useState(0);
  const series = SERIES.find((entry) => entry.id === seriesId) || SERIES[0];

  function chooseSeries(value: Series["id"]) {
    setSeriesId(value);
    const next = SERIES.find((entry) => entry.id === value) || SERIES[0];
    setSlice(Math.ceil(next.slices / 2));
  }

  function resetView() {
    setSlice(Math.ceil(series.slices / 2));
    setZoom(1);
    setWindowLevel(0);
  }

  return (
    <section className="mb-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-labelledby="pacs-free-demo-title">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500">PACS SANDBOX</p>
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800">FREE · NO SERVER</span>
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-900">SYNTHETIC ONLY</span>
          </div>
          <h2 id="pacs-free-demo-title" className="mt-1 text-base font-semibold text-slate-900">Try the imaging viewer</h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-600">
            Explore a browser-only illustrative study with slice navigation, zoom, and window/level controls. No patient data is used, nothing is uploaded, and nothing is saved.
          </p>
        </div>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="pacs-free-demo-viewer"
          onClick={() => setOpen((current) => !current)}
          className="min-h-11 shrink-0 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          {open ? "Close demo viewer" : "Open free demo viewer"}
        </button>
      </div>
      {open ? (
        <div id="pacs-free-demo-viewer" className="border-t border-slate-200 bg-slate-950 p-3 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-white">
            <div>
              <p className="text-sm font-semibold">MedLum Imaging · Demo mode</p>
              <p className="mt-1 text-[11px] text-slate-300">Case SD-0001 · Synthetic adult thorax · No patient identity</p>
            </div>
            <span className="rounded border border-amber-300/50 bg-amber-400/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-200">Not for clinical use</span>
          </div>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(230px,1fr)]">
            <div className="min-w-0 overflow-hidden rounded-xl border border-slate-700 bg-black">
              <SyntheticSlice series={seriesId} slice={slice} zoom={zoom} windowLevel={windowLevel} />
              <div className="flex items-center justify-between gap-2 border-t border-slate-700 px-3 py-2 text-xs text-slate-300">
                <button type="button" onClick={() => setSlice((current) => Math.max(1, current - 1))} disabled={slice <= 1} className="min-h-9 rounded-lg border border-slate-600 px-3 disabled:opacity-40">‹ Previous slice</button>
                <span className="tabular-nums">Slice {slice} / {series.slices}</span>
                <button type="button" onClick={() => setSlice((current) => Math.min(series.slices, current + 1))} disabled={slice >= series.slices} className="min-h-9 rounded-lg border border-slate-600 px-3 disabled:opacity-40">Next ›</button>
              </div>
            </div>
            <div className="space-y-4 rounded-xl border border-slate-700 bg-slate-900 p-3 text-white">
              <div>
                <label htmlFor="pacs-demo-series" className="mb-1 block text-xs font-semibold text-slate-200">Series</label>
                <select id="pacs-demo-series" value={seriesId} onChange={(event) => chooseSeries(event.target.value as Series["id"])} className="min-h-10 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 text-sm text-white">
                  {SERIES.map((entry) => <option key={entry.id} value={entry.id}>{entry.label} · {entry.slices} slices</option>)}
                </select>
              </div>
              <div>
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="pacs-demo-slice" className="text-xs font-semibold text-slate-200">Slice position</label>
                  <span className="text-xs tabular-nums text-slate-300">{slice}/{series.slices}</span>
                </div>
                <input id="pacs-demo-slice" aria-label="Synthetic slice position" type="range" min={1} max={series.slices} value={slice} onChange={(event) => setSlice(Number(event.target.value))} className="mt-2 w-full accent-rose-400" />
              </div>
              <div>
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="pacs-demo-zoom" className="text-xs font-semibold text-slate-200">Zoom</label>
                  <span className="text-xs tabular-nums text-slate-300">{Math.round(zoom * 100)}%</span>
                </div>
                <input id="pacs-demo-zoom" type="range" min={0.8} max={1.6} step={0.1} value={zoom} onChange={(event) => setZoom(Number(event.target.value))} className="mt-2 w-full accent-rose-400" />
              </div>
              <div>
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="pacs-demo-window" className="text-xs font-semibold text-slate-200">Window / level</label>
                  <span className="text-xs tabular-nums text-slate-300">{windowLevel > 0 ? "+" : ""}{windowLevel}</span>
                </div>
                <input id="pacs-demo-window" type="range" min={-50} max={50} step={5} value={windowLevel} onChange={(event) => setWindowLevel(Number(event.target.value))} className="mt-2 w-full accent-rose-400" />
              </div>
              <button type="button" onClick={resetView} className="min-h-10 w-full rounded-lg border border-slate-600 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800">Reset view</button>
              <div className="rounded-lg border border-amber-300/30 bg-amber-300/10 p-3 text-[11px] leading-5 text-amber-100">
                This is a locally rendered illustration, not a DICOM file or diagnostic image. Real image import and OHIF viewing stay disabled until a secure PACS server is configured.
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
