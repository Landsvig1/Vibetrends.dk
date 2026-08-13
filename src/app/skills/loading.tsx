/**
 * Skeleton for /skills.
 *
 * Two things it used to get wrong. Its blocks were `bg-background` inside
 * cards that are also `bg-background`, so every placeholder was the same color
 * as its own container and `animate-pulse` had nothing to pulse — four blank
 * rectangles. And it predicted a layout the page never renders: two columns,
 * four cards, five filter pills, against the real three columns, twelve cards
 * and three tabs, so hydration arrived as a visible reflow.
 */
export default function SkillsLoading() {
  return (
    <div className="space-y-10 animate-pulse">
      {/* Page Header Skeleton */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-4 flex-1 text-center md:text-left">
          <div className="h-9 w-64 bg-card-border rounded-lg mx-auto md:mx-0"></div>
          <div className="h-4 w-full max-w-xl bg-card-border rounded mx-auto md:mx-0"></div>
          <div className="h-4 w-3/4 max-w-lg bg-card-border rounded mx-auto md:mx-0"></div>
        </div>
        <div className="h-11 w-40 bg-card-border rounded-full mx-auto md:mx-0"></div>
      </div>

      {/* Search + three board tabs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="h-11 w-full max-w-md bg-card-border rounded-lg"></div>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-11 w-24 bg-card-border rounded-lg"></div>
          ))}
        </div>
      </div>

      {/* Result line */}
      <div className="h-4 w-56 bg-card-border rounded"></div>

      {/* Grid Skeleton — same three columns and twelve cards as the real grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 12 }, (_, i) => i).map((i) => (
          <div key={i} className="rounded-xl border border-card-border bg-card-bg p-6 space-y-6">
            <div className="space-y-4">
              <div className="flex justify-between items-start">
                <div className="space-y-2">
                  <div className="h-5 w-20 bg-card-border rounded"></div>
                  <div className="h-6 w-48 bg-card-border rounded"></div>
                </div>
                <div className="h-7 w-12 bg-card-border rounded"></div>
              </div>
              <div className="space-y-2">
                <div className="h-4 w-full bg-card-border rounded"></div>
                <div className="h-4 w-5/6 bg-card-border rounded"></div>
              </div>
              <div className="flex gap-1.5">
                {[1, 2, 3].map((j) => (
                  <div key={j} className="h-5 w-16 bg-card-border rounded"></div>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between pt-4 border-t border-card-border">
              <div className="space-y-2">
                <div className="h-4 w-24 bg-card-border rounded"></div>
                <div className="h-3 w-32 bg-card-border rounded"></div>
              </div>
              <div className="h-8 w-28 bg-card-border rounded"></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
