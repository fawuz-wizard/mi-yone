// Sparkline (Phase 4 §13): the single v1 chart primitive. 1.5px ink line, no axes,
// renders once, aria-hidden (the comparison text is the accessible equivalent).
export function Sparkline({ data, width = 56, height = 20 }: { data: number[]; width?: number; height?: number }) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const step = width / (data.length - 1);
  const points = data
    .map((v, i) => `${(i * step).toFixed(1)},${(height - 2 - ((v - min) / span) * (height - 4)).toFixed(1)}`)
    .join(" ");
  return (
    <svg aria-hidden width={width} height={height} className="text-text-secondary">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
