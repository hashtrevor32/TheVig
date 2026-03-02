export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="h-9 bg-slate-200 rounded-xl w-40 animate-pulse" />
      <div className="h-12 bg-slate-200 rounded-2xl animate-pulse" />
      <div className="flex gap-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-9 w-16 bg-slate-200 rounded-full animate-pulse" />
        ))}
      </div>
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 animate-pulse"
          >
            <div className="h-5 bg-slate-100 rounded-full w-24 mb-3" />
            <div className="h-4 bg-slate-100 rounded-lg w-2/3 mb-2" />
            <div className="h-3 bg-slate-100 rounded-lg w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}
