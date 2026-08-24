// SkeletonList (Phase 4 §13): content-shaped placeholders; static under reduced motion.
export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <div aria-hidden className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-14 rounded-card bg-skeleton motion-safe:animate-[miy-shimmer_1.4s_ease-in-out_infinite]"
        />
      ))}
    </div>
  );
}
