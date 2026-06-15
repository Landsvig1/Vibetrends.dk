export default function AgentsLoading() {
  return (
    <div className="space-y-10 animate-pulse">
      {/* Page Header Skeleton */}
      <div className="space-y-4 text-center md:text-left">
        <div className="h-9 w-64 bg-white/10 rounded-lg mx-auto md:mx-0"></div>
        <div className="h-4 w-full max-w-xl bg-white/5 rounded mx-auto md:mx-0"></div>
      </div>

      {/* Search Bar Skeleton */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="h-10 w-full max-w-md bg-white/10 rounded-lg"></div>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-8 w-20 bg-white/5 rounded-lg"></div>
          ))}
        </div>
      </div>

      {/* Grid of Agents Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[1, 2].map((i) => (
          <div key={i} className="rounded-xl border border-white/5 bg-slate-900/40 p-6 space-y-6">
            <div className="space-y-4">
              <div className="flex justify-between items-start">
                <div className="space-y-2">
                  <div className="h-5 w-20 bg-white/10 rounded"></div>
                  <div className="h-6 w-48 bg-white/10 rounded"></div>
                </div>
                <div className="h-7 w-12 bg-white/10 rounded"></div>
              </div>
              <div className="space-y-2">
                <div className="h-4 w-full bg-white/5 rounded"></div>
                <div className="h-4 w-5/6 bg-white/5 rounded"></div>
              </div>
              <div className="flex gap-1.5">
                {[1, 2, 3].map((j) => (
                  <div key={j} className="h-5 w-16 bg-white/5 rounded"></div>
                ))}
              </div>
            </div>
            <div className="space-y-3 pt-4 border-t border-white/5">
              <div className="h-4 w-32 bg-white/10 rounded"></div>
              <div className="h-10 w-full bg-white/10 rounded-lg"></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
