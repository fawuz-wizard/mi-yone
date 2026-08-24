"use client";
// Performance chart (owner-approved Phase 4 amendment: Home gains one time-range
// chart section). Built to the dataviz method: 2px round-join lines, ~10% area
// wash on the headline series, hairline gridlines, legend + selective direct
// label, crosshair tooltip listing every series, keyboard access, sr-only table.
// All values are SERVER-computed from the transaction ledger (mock backend until
// FastAPI lands) — including the %-change vs the previous period. The client
// only positions and displays them.
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/shared/api/client";
import { BUSINESS_ID } from "@/shared/api/session";
import type { PerfRange, PerformanceResponse } from "@/shared/api/types";
import { SegmentedTabs } from "@/shared/design-system/SegmentedTabs";
import { SkeletonList } from "@/shared/design-system/SkeletonList";
import { useT } from "@/shared/i18n";

const H = 190;
const PAD = { top: 12, right: 12, bottom: 22, left: 44 };

const SERIES = [
  { key: "income", varName: "var(--color-series-income)" },
  { key: "expenses", varName: "var(--color-series-expenses)" },
  { key: "net", varName: "var(--color-series-net)" },
] as const;

export function PerformanceChart() {
  const t = useT();
  const [range, setRange] = useState<PerfRange>("30d");
  const [active, setActive] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  const query = useQuery({
    queryKey: ["performance", range],
    queryFn: () => api<PerformanceResponse>(`/businesses/${BUSINESS_ID}/analytics/performance?range=${range}`),
    placeholderData: keepPreviousData,
  });

  const hasData = query.data != null;
  useEffect(() => {
    // The container only mounts once data exists — attach the observer then.
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasData]);

  const data = query.data;
  const ledgerEmpty =
    data != null &&
    data.totals.income.amount_minor === 0 &&
    data.totals.expenses.amount_minor === 0 &&
    data.previous_net.amount_minor === 0;
  const geometry = useMemo(() => {
    if (!data || width === 0) return null;
    const innerW = width - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;
    const n = data.buckets.length;
    const xs = data.buckets.map((_, i) => PAD.left + (n === 1 ? innerW / 2 : (i * innerW) / (n - 1)));
    const values = data.buckets.flatMap((b) => [b.income.amount_minor, b.expenses.amount_minor, b.net.amount_minor]);
    const rawMin = Math.min(0, ...values);
    const rawMax = Math.max(1, ...values);
    const step = niceStep((rawMax - rawMin) / 4);
    const yMin = Math.floor(rawMin / step) * step;
    const yMax = Math.ceil(rawMax / step) * step;
    const y = (v: number) => PAD.top + innerH - ((v - yMin) / (yMax - yMin)) * innerH;
    const ticks: number[] = [];
    for (let v = yMin; v <= yMax + 1; v += step) ticks.push(v);
    const path = (pick: (b: PerformanceResponse["buckets"][number]) => number) =>
      data.buckets.map((b, i) => `${i === 0 ? "M" : "L"}${xs[i].toFixed(1)},${y(pick(b)).toFixed(1)}`).join(" ");
    const netArea =
      path((b) => b.net.amount_minor) +
      ` L${xs[n - 1].toFixed(1)},${y(Math.max(yMin, 0)).toFixed(1)} L${xs[0].toFixed(1)},${y(Math.max(yMin, 0)).toFixed(1)} Z`;
    return { xs, y, ticks, yMin, path, netArea, innerH, n };
  }, [data, width]);

  const badge =
    data?.change_pct == null ? null : data.direction === "down" ? (
      <span className="money inline-flex items-center rounded-pill bg-danger-fill px-2.5 py-1 text-[13px] font-bold text-danger" data-testid="perf-badge">
        {t("perf.regression", { pct: data.change_pct })}
      </span>
    ) : (
      <span className="money inline-flex items-center rounded-pill bg-money-in-tint px-2.5 py-1 text-[13px] font-bold text-money-in" data-testid="perf-badge">
        {t("perf.progression", { pct: data.change_pct })}
      </span>
    );

  function pickIndex(clientX: number) {
    if (!geometry || !wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    let best = 0;
    let bestDist = Infinity;
    geometry.xs.forEach((px, i) => {
      const d = Math.abs(px - x);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    setActive(best);
  }

  if (ledgerEmpty) return null; // new business: the teaching empty state owns Home

  return (
    <section aria-label={t("perf.title")} className="rounded-card border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[17px] font-semibold">{t("perf.title")}</h3>
        <div className="flex items-center gap-2">
          {badge}
          {data?.change_pct != null ? (
            <span className="text-[13px] text-text-secondary">{t("perf.vsPrevious")}</span>
          ) : null}
        </div>
      </div>
      <div className="mt-2">
        <SegmentedTabs
          ariaLabel={t("perf.rangeLabel")}
          value={range}
          onChange={(r) => {
            setRange(r);
            setActive(null);
          }}
          tabs={[
            { value: "7d", label: t("perf.range7d") },
            { value: "30d", label: t("perf.range30d") },
            { value: "3m", label: t("perf.range3m") },
            { value: "6m", label: t("perf.range6m") },
            { value: "1y", label: t("perf.range1y") },
          ]}
        />
      </div>

      {!data ? (
        <div className="mt-3">
          <SkeletonList rows={2} />
        </div>
      ) : (
        <div className={query.isPlaceholderData ? "opacity-60" : ""}>
          <div
            ref={wrapRef}
            className="relative mt-3 select-none outline-none"
            style={{ height: H }}
            tabIndex={0}
            role="img"
            aria-label={t("perf.chartAria")}
            data-testid="perf-chart"
            onPointerMove={(e) => pickIndex(e.clientX)}
            onPointerLeave={() => setActive(null)}
            onKeyDown={(e) => {
              if (!geometry) return;
              if (e.key === "ArrowRight") setActive((a) => Math.min((a ?? -1) + 1, geometry.n - 1));
              if (e.key === "ArrowLeft") setActive((a) => Math.max((a ?? geometry.n) - 1, 0));
              if (e.key === "Escape") setActive(null);
            }}
          >
            {geometry ? (
              <svg width={width} height={H} aria-hidden>
                {/* gridlines + ticks */}
                {geometry.ticks.map((v) => (
                  <g key={v}>
                    <line
                      x1={PAD.left}
                      x2={width - PAD.right}
                      y1={geometry.y(v)}
                      y2={geometry.y(v)}
                      stroke="var(--color-border)"
                      strokeWidth={1}
                    />
                    <text
                      x={PAD.left - 6}
                      y={geometry.y(v) + 4}
                      textAnchor="end"
                      className="tabular"
                      fontSize={11}
                      fill="var(--color-text-secondary)"
                    >
                      {compactTick(v)}
                    </text>
                  </g>
                ))}
                {/* zero baseline emphasized when negatives exist */}
                {geometry.yMin < 0 ? (
                  <line
                    x1={PAD.left}
                    x2={width - PAD.right}
                    y1={geometry.y(0)}
                    y2={geometry.y(0)}
                    stroke="var(--color-text-disabled)"
                    strokeWidth={1}
                  />
                ) : null}
                {/* net area wash + lines */}
                <path d={geometry.netArea} fill="var(--color-series-net)" fillOpacity={0.1} />
                <path
                  d={geometry.path((b) => b.income.amount_minor)}
                  fill="none"
                  stroke="var(--color-series-income)"
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                <path
                  d={geometry.path((b) => b.expenses.amount_minor)}
                  fill="none"
                  stroke="var(--color-series-expenses)"
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                <path
                  d={geometry.path((b) => b.net.amount_minor)}
                  fill="none"
                  stroke="var(--color-series-net)"
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {/* end marker + direct label on the headline series only */}
                <circle
                  cx={geometry.xs[geometry.n - 1]}
                  cy={geometry.y(data.buckets[geometry.n - 1].net.amount_minor)}
                  r={4}
                  fill="var(--color-series-net)"
                  stroke="var(--color-surface)"
                  strokeWidth={2}
                />
                <text
                  x={geometry.xs[geometry.n - 1] - 4}
                  y={geometry.y(data.buckets[geometry.n - 1].net.amount_minor) - 8}
                  textAnchor="end"
                  className="tabular"
                  fontSize={11}
                  fontWeight={600}
                  fill="var(--color-text-primary)"
                >
                  {data.buckets[geometry.n - 1].net.display}
                </text>
                {/* first/last x labels (sparing) */}
                <text x={PAD.left} y={H - 6} fontSize={11} fill="var(--color-text-secondary)">
                  {data.buckets[0].label}
                </text>
                <text x={width - PAD.right} y={H - 6} textAnchor="end" fontSize={11} fill="var(--color-text-secondary)">
                  {data.buckets[geometry.n - 1].label}
                </text>
                {/* crosshair */}
                {active != null ? (
                  <line
                    x1={geometry.xs[active]}
                    x2={geometry.xs[active]}
                    y1={PAD.top}
                    y2={H - PAD.bottom}
                    stroke="var(--color-text-disabled)"
                    strokeWidth={1}
                  />
                ) : null}
              </svg>
            ) : null}

            {/* tooltip: every series at the active X; values lead, line keys not boxes */}
            {active != null && geometry && data.buckets[active] ? (
              <div
                className="pointer-events-none absolute top-2 z-10 w-56 rounded-card border border-border bg-surface p-2.5 shadow-float"
                style={{
                  left: Math.min(Math.max(geometry.xs[active] - 112, 0), Math.max(width - 224, 0)),
                }}
                data-testid="perf-tooltip"
              >
                <p className="text-[12px] font-semibold text-text-secondary">{data.buckets[active].label}</p>
                {SERIES.map(({ key, varName }) => (
                  <p key={key} className="mt-1 flex items-center gap-2 whitespace-nowrap text-[13px]">
                    <span aria-hidden className="inline-block h-0.5 w-3 shrink-0" style={{ background: varName }} />
                    <span className="money font-semibold text-text-primary">
                      {data.buckets[active][key].display}
                    </span>
                    <span className="truncate text-text-secondary">{t(`perf.${key}`)}</span>
                  </p>
                ))}
              </div>
            ) : null}
          </div>

          {/* legend with range totals — identity never color-alone */}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {SERIES.map(({ key, varName }) => (
              <p key={key} className="flex items-center gap-2 text-[13px] text-text-secondary">
                <span aria-hidden className="inline-block h-0.5 w-4" style={{ background: varName }} />
                {t(`perf.${key}`)}
                <span className="money font-semibold text-text-primary">{data.totals[key].display}</span>
              </p>
            ))}
          </div>

          {/* accessible table view — tooltips enhance, never gate */}
          <table className="sr-only">
            <caption>{t("perf.tableCaption")}</caption>
            <thead>
              <tr>
                <th scope="col">{t("perf.rangeLabel")}</th>
                <th scope="col">{t("perf.income")}</th>
                <th scope="col">{t("perf.expenses")}</th>
                <th scope="col">{t("perf.net")}</th>
              </tr>
            </thead>
            <tbody>
              {data.buckets.map((b, i) => (
                <tr key={i}>
                  <th scope="row">{b.label}</th>
                  <td>{b.income.display}</td>
                  <td>{b.expenses.display}</td>
                  <td>{b.net.display}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// Display-only scale helpers (tick annotation, not financial truth).
function niceStep(raw: number): number {
  const pow = 10 ** Math.floor(Math.log10(Math.max(raw, 1)));
  const unit = raw / pow;
  const nice = unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10;
  return nice * pow;
}

function compactTick(minor: number): string {
  const whole = minor / 100;
  const abs = Math.abs(whole);
  const sign = whole < 0 ? "−" : "";
  if (abs >= 1_000_000) return `${sign}${trimZero((abs / 1_000_000).toFixed(1))}M`;
  if (abs >= 1_000) return `${sign}${trimZero((abs / 1_000).toFixed(0))}K`;
  return `${sign}${abs}`;
}

function trimZero(s: string): string {
  return s.endsWith(".0") ? s.slice(0, -2) : s;
}
