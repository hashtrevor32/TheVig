"use client";

import { useState, useRef } from "react";
import { createBet } from "@/lib/actions";
import { useRouter } from "next/navigation";
import { Camera, Loader2, X, Sparkles } from "lucide-react";

type MemberCredit = {
  id: string;
  name: string;
  creditLimit: number;
  openExposure: number;
  availableCredit: number;
  freePlayBalance: number;
};

type ParsedBet = {
  description: string;
  oddsAmerican: number;
  stake: number;
  eventKey: string;
  placedAt: string | null;
};

type ExistingBet = {
  description: string;
  oddsAmerican: number;
  stakeCashUnits: number;
  stakeFreePlayUnits: number;
  placedAt: string;
};

export function AddBetForm({
  weekId,
  members,
  existingBetsByMember = {},
}: {
  weekId: string;
  members: MemberCredit[];
  existingBetsByMember?: Record<string, ExistingBet[]>;
}) {
  const [memberId, setMemberId] = useState("");
  const [description, setDescription] = useState("");
  const [eventKey, setEventKey] = useState("");
  const [oddsAmerican, setOddsAmerican] = useState("");
  const [stakeCashUnits, setStakeCashUnits] = useState("");
  const [placedAt, setPlacedAt] = useState<string | null>(null);
  const [isFreePlay, setIsFreePlay] = useState(false);
  const [overrideCredit, setOverrideCredit] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  // AI scan state
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const [allScannedBets, setAllScannedBets] = useState<ParsedBet[]>([]);
  const [parsedBets, setParsedBets] = useState<ParsedBet[]>([]);
  const [skippedBets, setSkippedBets] = useState<ParsedBet[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedMember = members.find((m) => m.id === memberId);
  const stake = parseInt(stakeCashUnits) || 0;
  const exceedsCredit =
    !isFreePlay && selectedMember && stake > selectedMember.availableCredit;
  const exceedsFP =
    isFreePlay && selectedMember && stake > selectedMember.freePlayBalance;

  function compressImage(file: File): Promise<{ base64: string; mediaType: string }> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX = 1200;
        let w = img.width;
        let h = img.height;
        if (w > MAX || h > MAX) {
          if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
          else { w = Math.round(w * MAX / h); h = MAX; }
        }
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
        const base64 = dataUrl.split(",")[1];
        URL.revokeObjectURL(img.src);
        resolve({ base64, mediaType: "image/jpeg" });
      };
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = URL.createObjectURL(file);
    });
  }

  function isDuplicate(bet: ParsedBet, memberExisting: ExistingBet[]): boolean {
    return memberExisting.some((existing) => {
      const descMatch =
        existing.description.toLowerCase().trim() === bet.description.toLowerCase().trim();
      const oddsMatch = existing.oddsAmerican === bet.oddsAmerican;
      const totalStake = existing.stakeCashUnits + existing.stakeFreePlayUnits;
      const stakeMatch = bet.stake > 0 && totalStake === bet.stake;

      // If the scanned bet has a placedAt timestamp, compare to the second
      if (bet.placedAt && descMatch && oddsMatch) {
        try {
          const scannedTime = new Date(bet.placedAt).getTime();
          const existingTime = new Date(existing.placedAt).getTime();
          // Match if within 60 seconds (timestamps may differ slightly)
          if (Math.abs(scannedTime - existingTime) < 60_000) return true;
        } catch {
          // If date parsing fails, fall through to basic matching
        }
      }

      // Fallback: match on description + odds + stake
      return descMatch && oddsMatch && stakeMatch;
    });
  }

  async function handleScan(file: File) {
    setScanError("");
    setScanning(true);
    setAllScannedBets([]);
    setParsedBets([]);
    setSkippedBets([]);

    // Show preview
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);

    try {
      // Compress and convert to base64
      const { base64, mediaType } = await compressImage(file);

      const res = await fetch("/api/parse-slip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64, mediaType }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to parse");
      }

      if (data.bets && data.bets.length > 0) {
        // Filter out bets already placed for the selected member
        const memberExisting = memberId ? existingBetsByMember[memberId] || [] : [];
        const newBets: ParsedBet[] = [];
        const dupes: ParsedBet[] = [];

        for (const bet of data.bets) {
          if (memberId && isDuplicate(bet, memberExisting)) {
            dupes.push(bet);
          } else {
            newBets.push(bet);
          }
        }

        setAllScannedBets(data.bets);
        setSkippedBets(dupes);

        if (newBets.length > 0) {
          setParsedBets(newBets);
          fillBet(newBets[0]);
        } else if (dupes.length > 0) {
          setScanError(`All ${dupes.length} bet(s) already exist for this member.`);
        } else {
          setScanError("No bets detected in image. Try a clearer photo.");
        }
      } else {
        setScanError("No bets detected in image. Try a clearer photo.");
      }
    } catch (err) {
      setScanError(
        err instanceof Error ? err.message : "Failed to scan bet slip"
      );
    } finally {
      setScanning(false);
    }
  }

  function fillBet(bet: ParsedBet) {
    setDescription(bet.description);
    setOddsAmerican(String(bet.oddsAmerican));
    if (bet.stake > 0) setStakeCashUnits(String(bet.stake));
    if (bet.eventKey) setEventKey(bet.eventKey);
    setPlacedAt(bet.placedAt || null);
  }

  function handleMemberChange(newMemberId: string) {
    setMemberId(newMemberId);
    // Re-filter scanned bets for new member
    if (allScannedBets.length > 0) {
      const memberExisting = newMemberId ? existingBetsByMember[newMemberId] || [] : [];
      const newBets: ParsedBet[] = [];
      const dupes: ParsedBet[] = [];
      for (const bet of allScannedBets) {
        if (newMemberId && isDuplicate(bet, memberExisting)) {
          dupes.push(bet);
        } else {
          newBets.push(bet);
        }
      }
      setParsedBets(newBets);
      setSkippedBets(dupes);
      setScanError("");
      if (newBets.length > 0) {
        fillBet(newBets[0]);
      } else if (dupes.length > 0) {
        setScanError(`All ${dupes.length} bet(s) already exist for this member.`);
      }
    }
  }

  function clearScan() {
    setAllScannedBets([]);
    setParsedBets([]);
    setSkippedBets([]);
    setPreviewUrl(null);
    setScanError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!memberId || !description || !oddsAmerican || !stakeCashUnits) return;

    setLoading(true);
    try {
      await createBet({
        weekId,
        memberId,
        description,
        eventKey: eventKey || undefined,
        oddsAmerican: parseInt(oddsAmerican),
        stakeCashUnits: isFreePlay ? 0 : stake,
        stakeFreePlayUnits: isFreePlay ? stake : 0,
        overrideCredit: isFreePlay || overrideCredit,
        placedAt: placedAt || undefined,
      });

      // If there are more parsed bets queued, fill the next one
      if (parsedBets.length > 1) {
        const remaining = parsedBets.filter(
          (b) => b.description !== description || b.oddsAmerican !== parseInt(oddsAmerican)
        );
        setParsedBets(remaining);
        if (remaining.length > 0) {
          fillBet(remaining[0]);
          setStakeCashUnits("");
          setLoading(false);
          router.refresh();
          return;
        }
      }

      router.push(`/weeks/${weekId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create bet");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Member Selector — first so it's always visible */}
      <div>
        <label className="text-xs text-gray-500 mb-1 block">Member</label>
        <select
          value={memberId}
          onChange={(e) => handleMemberChange(e.target.value)}
          className="w-full px-3 py-2.5 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Select member...</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} ({m.availableCredit} credit{m.freePlayBalance > 0 ? `, ${m.freePlayBalance} FP` : ""})
            </option>
          ))}
        </select>
      </div>

      {/* Credit / FP Panel */}
      {selectedMember && !isFreePlay && (
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-3 space-y-2">
          <div className="flex justify-between text-xs text-gray-400">
            <span>Credit: {selectedMember.creditLimit} units</span>
            <span>Used: {selectedMember.openExposure} units</span>
            <span>Available: {selectedMember.availableCredit} units</span>
          </div>
          <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
            {(() => {
              const pct =
                selectedMember.creditLimit > 0
                  ? ((selectedMember.openExposure + stake) /
                      selectedMember.creditLimit) *
                    100
                  : 0;
              const color =
                pct < 50
                  ? "bg-green-500"
                  : pct < 80
                  ? "bg-yellow-500"
                  : "bg-red-500";
              return (
                <div
                  className={`h-full ${color} rounded-full transition-all`}
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              );
            })()}
          </div>
        </div>
      )}
      {selectedMember && isFreePlay && (
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
          <div className="flex justify-between text-xs">
            <span className="text-blue-400">Free Play Balance</span>
            <span className="text-blue-300 font-medium">{selectedMember.freePlayBalance} FP</span>
          </div>
        </div>
      )}

      {/* AI Scan Button */}
      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleScan(file);
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={scanning}
          className="w-full py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:from-gray-700 disabled:to-gray-700 text-white font-medium rounded-lg flex items-center justify-center gap-2 transition-all"
        >
          {scanning ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Scanning bet slip...
            </>
          ) : (
            <>
              <Camera size={18} />
              <Sparkles size={14} />
              Scan Bet Slip
            </>
          )}
        </button>
        <p className="text-gray-600 text-xs text-center mt-1">
          Take a photo or upload a screenshot — AI fills the form
        </p>
      </div>

      {/* Scan Preview & Results */}
      {previewUrl && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Scanned Image</span>
            <button
              type="button"
              onClick={clearScan}
              className="text-gray-500 hover:text-gray-300"
            >
              <X size={14} />
            </button>
          </div>
          <img
            src={previewUrl}
            alt="Bet slip"
            className="w-full rounded-lg max-h-40 object-contain bg-gray-800"
          />
          {scanError && (
            <p className="text-red-400 text-xs">{scanError}</p>
          )}
        </div>
      )}

      {/* Multiple Bets Detected */}
      {parsedBets.length > 1 && (
        <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3 space-y-2">
          <p className="text-purple-400 text-xs font-medium">
            {parsedBets.length} bets detected — submit one at a time
          </p>
          <div className="space-y-1">
            {parsedBets.map((b, i) => (
              <button
                key={i}
                type="button"
                onClick={() => fillBet(b)}
                className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${
                  description === b.description &&
                  oddsAmerican === String(b.oddsAmerican)
                    ? "bg-purple-500/20 text-purple-300"
                    : "text-gray-400 hover:bg-gray-800"
                }`}
              >
                {b.description} ({b.oddsAmerican > 0 ? "+" : ""}
                {b.oddsAmerican})
                {b.stake > 0 && ` · ${b.stake} units`}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Skipped Duplicates */}
      {skippedBets.length > 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 space-y-2">
          <p className="text-yellow-400 text-xs font-medium">
            {skippedBets.length} bet{skippedBets.length > 1 ? "s" : ""} already exist for this member — skipped
          </p>
          <div className="space-y-1">
            {skippedBets.map((b, i) => (
              <p key={i} className="text-gray-500 text-xs line-through">
                {b.description} ({b.oddsAmerican > 0 ? "+" : ""}
                {b.oddsAmerican})
                {b.stake > 0 && ` · ${b.stake} units`}
                {b.placedAt && ` · ${b.placedAt}`}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Bet Fields */}
      <div>
        <label className="text-xs text-gray-500 mb-1 block">Description</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Chiefs -3.5"
          className="w-full px-3 py-2.5 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="text-xs text-gray-500 mb-1 block">
          Event Key (optional)
        </label>
        <input
          type="text"
          value={eventKey}
          onChange={(e) => setEventKey(e.target.value)}
          placeholder="e.g. chiefs-bills-jan26"
          className="w-full px-3 py-2.5 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Free Play Toggle */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setIsFreePlay(false)}
          className={`flex-1 py-2 text-xs font-medium rounded-lg transition-colors ${
            !isFreePlay
              ? "bg-blue-600 text-white"
              : "bg-gray-800 text-gray-400 hover:text-white"
          }`}
        >
          Cash Bet
        </button>
        <button
          type="button"
          onClick={() => setIsFreePlay(true)}
          className={`flex-1 py-2 text-xs font-medium rounded-lg transition-colors ${
            isFreePlay
              ? "bg-blue-600 text-white"
              : "bg-gray-800 text-gray-400 hover:text-white"
          }`}
        >
          Free Play Bet
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">
            Odds (American)
          </label>
          <input
            type="number"
            value={oddsAmerican}
            onChange={(e) => setOddsAmerican(e.target.value)}
            placeholder="-110"
            className="w-full px-3 py-2.5 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">
            {isFreePlay ? "Free Play (units)" : "Stake (units)"}
          </label>
          <input
            type="number"
            value={stakeCashUnits}
            onChange={(e) => setStakeCashUnits(e.target.value)}
            placeholder="100"
            min="1"
            className={`w-full px-3 py-2.5 bg-gray-900 border rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              isFreePlay ? "border-blue-500/50" : "border-gray-700"
            }`}
          />
        </div>
      </div>

      {/* Credit Warning */}
      {exceedsCredit && !overrideCredit && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
          <p className="text-red-400 text-sm">
            Stake exceeds available credit by{" "}
            {stake - selectedMember!.availableCredit} units
          </p>
        </div>
      )}

      {/* FP Balance Warning */}
      {exceedsFP && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
          <p className="text-red-400 text-sm">
            Free play stake exceeds balance by{" "}
            {stake - selectedMember!.freePlayBalance} FP
          </p>
        </div>
      )}

      {/* Admin Override */}
      {!isFreePlay && (
        <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
          <input
            type="checkbox"
            checked={overrideCredit}
            onChange={(e) => setOverrideCredit(e.target.checked)}
            className="rounded bg-gray-800 border-gray-600"
          />
          Admin override (bypass credit limit)
        </label>
      )}

      {error && (
        <p className="text-red-400 text-sm">{error}</p>
      )}

      <button
        type="submit"
        disabled={
          loading ||
          !memberId ||
          !description ||
          !oddsAmerican ||
          !stakeCashUnits ||
          (!!exceedsCredit && !overrideCredit) ||
          !!exceedsFP
        }
        className={`w-full py-3 ${
          isFreePlay
            ? "bg-blue-600 hover:bg-blue-700"
            : "bg-blue-600 hover:bg-blue-700"
        } disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium rounded-lg transition-colors`}
      >
        {loading
          ? "Placing..."
          : parsedBets.length > 1
          ? `Place ${isFreePlay ? "FP " : ""}Bet (${parsedBets.length - 1} more queued)`
          : isFreePlay
          ? "Place Free Play Bet"
          : "Place Bet"}
      </button>
    </form>
  );
}
