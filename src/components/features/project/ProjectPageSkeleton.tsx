export function ProjectPageSkeleton() {
  return (
    <div className="h-full flex flex-col">
      {/* ── Header ── */}
      <header className="sticky top-0 bg-white border-b border-slate-200 flex-none z-50">
        <div className="w-full px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          {/* Left: back icon + project name */}
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-full bg-slate-100 animate-pulse" />
            <div className="h-5 w-px bg-slate-200" />
            <div className="flex flex-col gap-1.5">
              <div className="h-3.5 w-36 rounded bg-slate-200 animate-pulse" />
              <div className="h-2.5 w-20 rounded bg-slate-100 animate-pulse" />
            </div>
          </div>

          {/* Right: tab buttons */}
          <div className="flex items-center gap-2">
            {/* Imperial toggle */}
            <div className="h-7 w-20 rounded border border-slate-200 bg-slate-100 animate-pulse" />

            <div className="h-5 w-px bg-slate-200 mx-1" />

            {/* Materials, Mat+Lab, Labor, Markups */}
            {[72, 64, 52, 68].map((w, i) => (
              <div
                key={i}
                style={{ width: w }}
                className="h-7 rounded bg-slate-100 animate-pulse"
              />
            ))}

            <div className="h-5 w-px bg-slate-200 mx-1" />

            {/* Reports */}
            <div className="h-7 w-16 rounded bg-slate-100 animate-pulse" />

            <div className="h-5 w-px bg-slate-200 mx-1" />

            {/* Exit Project */}
            <div className="h-5 w-20 rounded bg-slate-100 animate-pulse" />
          </div>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left panel — Wall Assemblies (matches real 40% default sidebar width) */}
        <aside className="w-2/5 flex-none border-r border-slate-200 bg-white flex flex-col overflow-hidden">
          {/* Panel header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-slate-200 animate-pulse" />
              <div className="h-3.5 w-28 rounded bg-slate-200 animate-pulse" />
            </div>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="w-5 h-5 rounded bg-slate-100 animate-pulse" />
              ))}
            </div>
          </div>

          {/* Search bar */}
          <div className="px-3 py-2 border-b border-slate-100">
            <div className="h-8 rounded-lg bg-slate-100 animate-pulse" />
          </div>

          {/* Column headers */}
          <div className="flex items-center px-3 py-2 border-b border-slate-100 gap-2">
            <div className="flex-1 h-2.5 w-20 rounded bg-slate-100 animate-pulse" />
            <div className="h-2.5 w-8 rounded bg-slate-100 animate-pulse" />
            <div className="h-2.5 w-10 rounded bg-slate-100 animate-pulse" />
          </div>

          {/* Assembly rows */}
          <div className="flex flex-col divide-y divide-slate-100 overflow-hidden">
            {[90, 75, 85, 70, 80, 65, 88].map((w, i) => (
              <div key={i} className="flex items-center px-3 py-3 gap-2">
                <div className="flex-1 flex flex-col gap-1.5">
                  <div
                    style={{ width: `${w}%` }}
                    className="h-2.5 rounded bg-slate-200 animate-pulse"
                  />
                  <div className="h-2 w-16 rounded bg-slate-100 animate-pulse" />
                </div>
                <div className="h-2.5 w-6 rounded bg-slate-100 animate-pulse" />
                <div className="h-2.5 w-10 rounded bg-slate-100 animate-pulse" />
              </div>
            ))}
          </div>
        </aside>

        {/* Right panel — Takeoff Schedule */}
        <main className="flex-1 flex flex-col overflow-hidden bg-white">
          {/* Panel header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-slate-200 animate-pulse" />
              <div className="h-3.5 w-36 rounded bg-slate-200 animate-pulse" />
            </div>
            <div className="h-8 w-28 rounded-lg border border-slate-200 bg-slate-100 animate-pulse" />
          </div>

          {/* Filter bar */}
          <div className="flex items-center gap-3 px-5 py-2.5 border-b border-slate-100">
            <div className="h-2.5 w-14 rounded bg-slate-100 animate-pulse" />
            <div className="h-8 w-36 rounded-lg bg-slate-100 animate-pulse" />
            <div className="h-8 w-40 rounded-lg bg-slate-100 animate-pulse" />
            <div className="flex-1" />
            <div className="h-8 w-48 rounded-lg bg-slate-100 animate-pulse" />
            <div className="h-8 w-8 rounded-lg bg-slate-200 animate-pulse" />
          </div>

          {/* Table column headers */}
          <div className="flex items-center px-5 py-2 border-b border-slate-200 bg-slate-50 gap-3">
            {[40, 48, 32, 120, 56, 40, 52, 48, 40, 52].map((w, i) => (
              <div
                key={i}
                style={{ width: w, flexShrink: 0 }}
                className="h-2.5 rounded bg-slate-200 animate-pulse"
              />
            ))}
          </div>

          {/* Table rows */}
          <div className="flex flex-col divide-y divide-slate-50 overflow-hidden">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="flex items-center px-5 py-3 gap-3">
                <div className="h-2.5 w-10 rounded bg-slate-100 animate-pulse flex-shrink-0" />
                <div className="h-2.5 w-12 rounded bg-slate-100 animate-pulse flex-shrink-0" />
                <div className="h-2.5 w-8 rounded bg-slate-100 animate-pulse flex-shrink-0" />
                <div
                  className="h-2.5 rounded bg-slate-200 animate-pulse flex-1"
                  style={{ opacity: 1 - i * 0.07 }}
                />
                <div className="h-2.5 w-14 rounded bg-slate-100 animate-pulse flex-shrink-0" />
                <div className="h-2.5 w-10 rounded bg-slate-100 animate-pulse flex-shrink-0" />
                <div className="h-2.5 w-12 rounded bg-slate-100 animate-pulse flex-shrink-0" />
                <div className="h-2.5 w-12 rounded bg-slate-100 animate-pulse flex-shrink-0" />
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
