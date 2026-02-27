export default function Loading() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white">EV Finder</h2>
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="bg-gray-900 rounded-xl border border-gray-800 p-4 animate-pulse"
          >
            <div className="h-4 bg-gray-800 rounded w-1/3 mb-2" />
            <div className="h-3 bg-gray-800 rounded w-2/3 mb-1" />
            <div className="h-3 bg-gray-800 rounded w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}
