"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

export function CopySummary({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={handleCopy}
      className="w-full py-3 bg-gray-800 hover:bg-gray-700 text-white font-medium rounded-lg flex items-center justify-center gap-2 transition-colors"
    >
      {copied ? (
        <>
          <Check size={18} className="text-green-400" />
          Copied!
        </>
      ) : (
        <>
          <Copy size={18} />
          Copy Summary for Group Chat
        </>
      )}
    </button>
  );
}
