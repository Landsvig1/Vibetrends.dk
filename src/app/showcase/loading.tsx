export default function ShowcaseLoading() {
  return (
    <div className="space-y-10 animate-pulse">
      {/* Page Header Skeleton */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-3 text-center md:text-left">
          <div className="h-9 w-64 bg-white/10 rounded-lg mx-auto md:mx-0"></div>
          <div className="h-4 w-full max-w-xl bg-white/5 rounded mx-auto md:mx-0"></div>
        </div>
        <div className="h-11 w-44 bg-white/10 rounded-lg mx-auto md:mx-0"></div>
      </div>

      {/* Search Bar Skeleton */}
      <div className="h-10 w-full max-w-md bg-white/10 rounded-lg"></div>

      {/* Grid of Projects Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-white/5 bg-slate-900/40 overflow-hidden flex flex-col">
            <div className="h-44 bg-white/10"></div>
            <div className="p-6 space-y-4 flex-1">
              <div className="space-y-2">
                <div className="h-6 w-3/4 bg-white/10 rounded"></div>
                <div className="h-4 w-1/3 bg-white/5 rounded"></div>
                <div className="h-4 w-full bg-white/5 rounded pt-2"></div>
                <div className="h-4 w-5/6 bg-white/5 rounded"></div>
              </div>
              <div className="flex gap-1.5 pt-2">
                {[1, 2, 3].map((j) => (
                  <div key={j} className="h-5 w-16 bg-white/5 rounded"></div>
                ))}
              </div>
              <div className="flex items-center justify-between pt-4 border-t border-white/5 gap-2">
                <div className="h-8 flex-1 bg-white/10 rounded-lg"></div>
                <div className="h-8 w-8 bg-white/5 rounded-lg"></div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
