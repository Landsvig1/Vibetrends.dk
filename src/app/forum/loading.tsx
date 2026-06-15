export default function ForumLoading() {
  return (
    <div className="space-y-10 animate-pulse">
      {/* Page Header Skeleton */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-3 text-center md:text-left">
          <div className="h-9 w-64 bg-background rounded-lg mx-auto md:mx-0"></div>
          <div className="h-4 w-full max-w-xl bg-background rounded mx-auto md:mx-0"></div>
        </div>
        <div className="h-11 w-44 bg-background rounded-lg mx-auto md:mx-0"></div>
      </div>

      {/* Categories & Search Skeleton */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="h-10 w-full max-w-md bg-background rounded-lg"></div>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-8 w-20 bg-background rounded-lg"></div>
          ))}
        </div>
      </div>

      {/* Forum Threads List Skeleton */}
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-card-border bg-background p-6 space-y-4">
            <div className="flex justify-between items-start gap-4">
              <div className="space-y-2 flex-1">
                <div className="h-5 w-24 bg-background rounded"></div>
                <div className="h-6 w-3/4 bg-background rounded"></div>
                <div className="h-4 w-full bg-background rounded pt-1"></div>
              </div>
              <div className="h-8 w-12 bg-background rounded-lg"></div>
            </div>
            <div className="flex items-center space-x-4 pt-3 border-t border-card-border">
              <div className="h-3.5 w-24 bg-background rounded"></div>
              <div className="h-3.5 w-16 bg-background rounded"></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
