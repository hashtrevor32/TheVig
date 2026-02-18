"use client";

export default function AddBetError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="space-y-4 p-4">
      <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
        <h2 className="text-red-400 font-bold text-lg mb-2">Error Adding Bet</h2>
        <p className="text-red-300 text-sm mb-1">{error.message}</p>
        {error.digest && (
          <p className="text-gray-500 text-xs">Digest: {error.digest}</p>
        )}
        <pre className="text-gray-400 text-xs mt-2 whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
          {error.stack}
        </pre>
      </div>
      <button
        onClick={reset}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm"
      >
        Try Again
      </button>
    </div>
  );
}
