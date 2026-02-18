"use client";

import { useState, useRef } from "react";
import { createBet, createBulkBets } from "@/lib/actions";
import { useRouter } from "next/navigation";
import { Camera, Loader2, X, Sparkles, ClipboardPaste, CheckCircle2 } from "lucide-react";

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
  isFreePlay?: boolean;
  eventKey: string;
  sport?: string;
  betType?: string;
  placedAt: string | null;
  settled?: "WIN" | "LOSS" | "PUSH" | null;
  profitAmount?: number | null;
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
  const [sport, setSport] = useState("");
  const [betType, setBetType] = useState("");
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

  // Paste text state
  const [showPasteBox, setShowPasteBox] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [parsingText, setParsingText] = useState(false);

  // Bulk add state
  const [addingAll, setAddingAll] = useState(false);
  const [bulkSuccess, setBulkSuccess] = useState<string | null>(null);

  // Track bets added in this session for duplicate detection across scans
  const [sessionAddedBets, setSessionAddedBets] = useState<Record<string, ExistingBet[]>>({});

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

  function normalizeDesc(s: string): string {
    return s
      .toLowerCase()
      .replace(/[^a-z0-9.+\-]/g, " ") // strip punctuation except .+-
      .replace(/\s+/g, " ")
      .trim();
  }

  function isDuplicate(bet: ParsedBet, memberExisting: ExistingBet[]): boolean {
    return memberExisting.some((existing) => {
      const oddsMatch = existing.oddsAmerican === bet.oddsAmerican;
      const totalStake = existing.stakeCashUnits + existing.stakeFreePlayUnits;
      const stakeMatch = bet.stake > 0 && totalStake === bet.stake;

      // Must at least have matching odds and stake to even consider
      if (!oddsMatch || !stakeMatch) return false;

      // If both have timestamps, only the timestamp decides.
      // Different second = different bet (intentional re-bet). Same second = duplicate.
      if (bet.placedAt && existing.placedAt) {
        try {
          const scannedTime = new Date(bet.placedAt).getTime();
          const existingTime = new Date(existing.placedAt).getTime();
          if (!isNaN(scannedTime) && !isNaN(existingTime)) {
            // Same timestamp (within 2s to handle rounding) = duplicate
            return Math.abs(scannedTime - existingTime) < 2_000;
          }
        } catch {
          // timestamp parse failed — fall through to description check
        }
      }

      // No timestamp available — fall back to description match
      const betDescNorm = normalizeDesc(bet.description);
      const existDescNorm = normalizeDesc(existing.description);

      const descExact = existDescNorm === betDescNorm;
      const descFuzzy =
        betDescNorm.length >= 6 &&
        existDescNorm.length >= 6 &&
        (existDescNorm.includes(betDescNorm) || betDescNorm.includes(existDescNorm));

      return descExact || descFuzzy;
    });
  }

  function filterBets(allBets: ParsedBet[], forMemberId: string) {
    // Combine server-loaded existing bets with bets added this session
    const serverBets = forMemberId ? existingBetsByMember[forMemberId] || [] : [];
    const sessionBets = forMemberId ? sessionAddedBets[forMemberId] || [] : [];
    const memberExisting = [...serverBets, ...sessionBets];

    const newBets: ParsedBet[] = [];
    const dupes: ParsedBet[] = [];

    for (const bet of allBets) {
      if (forMemberId && isDuplicate(bet, memberExisting)) {
        dupes.push(bet);
      } else {
        newBets.push(bet);
      }
    }

    return { newBets, dupes };
  }

  async function handleScan(file: File) {
    setScanError("");
    setScanning(true);
    setAllScannedBets([]);
    setParsedBets([]);
    setSkippedBets([]);
    setBulkSuccess(null);

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
        const { newBets, dupes } = filterBets(data.bets, memberId);

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

  async function handleParseText() {
    if (!pasteText.trim()) return;

    setScanError("");
    setParsingText(true);
    setAllScannedBets([]);
    setParsedBets([]);
    setSkippedBets([]);
    setPreviewUrl(null);
    setBulkSuccess(null);

    try {
      const res = await fetch("/api/parse-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: pasteText }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to parse text");
      }

      if (data.bets && data.bets.length > 0) {
        const { newBets, dupes } = filterBets(data.bets, memberId);

        setAllScannedBets(data.bets);
        setSkippedBets(dupes);

        if (newBets.length > 0) {
          setParsedBets(newBets);
          fillBet(newBets[0]);
        } else if (dupes.length > 0) {
          setScanError(`All ${dupes.length} bet(s) already exist for this member.`);
        } else {
          setScanError("No bets found in text.");
        }
      } else {
        setScanError("No bets found in pasted text. Try different text.");
      }
    } catch (err) {
      setScanError(
        err instanceof Error ? err.message : "Failed to parse text"
      );
    } finally {
      setParsingText(false);
    }
  }

  function fillBet(bet: ParsedBet) {
    setDescription(bet.description);
    setOddsAmerican(String(bet.oddsAmerican));
    if (bet.eventKey) setEventKey(bet.eventKey);
    setSport(bet.sport || "");
    setBetType(bet.betType || "");
    setPlacedAt(bet.placedAt || null);

    if (bet.isFreePlay) {
      setIsFreePlay(true);
      // AI gives us the "to win" amount — back-calculate the FP stake from odds
      const toWin = bet.stake;
      let fpStake = 0;
      if (bet.oddsAmerican > 0) {
        // +odds: toWin = stake * odds / 100  =>  stake = toWin * 100 / odds
        fpStake = Math.round((toWin * 100) / bet.oddsAmerican);
      } else {
        // -odds: toWin = stake * 100 / |odds|  =>  stake = toWin * |odds| / 100
        fpStake = Math.round((toWin * Math.abs(bet.oddsAmerican)) / 100);
      }
      setStakeCashUnits(String(fpStake > 0 ? fpStake : toWin));
    } else {
      setIsFreePlay(false);
      if (bet.stake > 0) setStakeCashUnits(String(bet.stake));
    }
  }

  function handleMemberChange(newMemberId: string) {
    setMemberId(newMemberId);
    setBulkSuccess(null);
    // Re-filter scanned bets for new member
    if (allScannedBets.length > 0) {
      const { newBets, dupes } = filterBets(allScannedBets, newMemberId);
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
    setBulkSuccess(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleAddAll() {
    if (!memberId || parsedBets.length === 0) return;

    setAddingAll(true);
    setError("");
    setBulkSuccess(null);

    try {
      const result = await createBulkBets({
        weekId,
        memberId,
        overrideCredit: true, // scanned/pasted bets bypass credit since they're already placed
        bets: parsedBets.map((b) => {
          const betIsFP = b.isFreePlay || isFreePlay;
          let betStake: number;

          if (betIsFP && b.isFreePlay) {
            // AI detected free play — back-calculate FP stake from "to win" amount
            const toWin = b.stake;
            if (b.oddsAmerican > 0) {
              betStake = Math.round((toWin * 100) / b.oddsAmerican);
            } else {
              betStake = Math.round((toWin * Math.abs(b.oddsAmerican)) / 100);
            }
            if (betStake <= 0) betStake = Math.round(toWin);
          } else {
            betStake = b.stake > 0 ? Math.round(b.stake) : stake;
          }

          // Calculate payout for pre-settled bets
          let settled: "WIN" | "LOSS" | "PUSH" | undefined;
          let payoutCashUnits: number | undefined;
          if (b.settled) {
            settled = b.settled;
            const cashStake = betIsFP ? 0 : betStake;
            const totalStake = betStake; // cash or FP — used for payout calc
            if (b.settled === "LOSS") {
              payoutCashUnits = 0;
            } else if (b.settled === "PUSH") {
              payoutCashUnits = cashStake;
            } else if (b.settled === "WIN") {
              // If AI gave us a profitAmount, use stake + profit as payout
              if (b.profitAmount != null && b.profitAmount > 0) {
                payoutCashUnits = cashStake + Math.round(b.profitAmount);
              } else {
                // Calculate from odds
                const odds = Math.round(b.oddsAmerican);
                if (odds > 0) {
                  payoutCashUnits = totalStake + Math.round((totalStake * odds) / 100);
                } else {
                  payoutCashUnits = totalStake + Math.round((totalStake * 100) / Math.abs(odds));
                }
              }
            }
          }

          return {
            description: b.description,
            eventKey: b.eventKey || undefined,
            sport: b.sport || undefined,
            betType: b.betType || undefined,
            oddsAmerican: Math.round(b.oddsAmerican),
            stakeCashUnits: betIsFP ? 0 : betStake,
            stakeFreePlayUnits: betIsFP ? betStake : 0,
            placedAt: b.placedAt || undefined,
            ...(settled ? { settled, payoutCashUnits } : {}),
          };
        }),
      });

      // Track added bets locally for duplicate detection on subsequent scans
      const addedForMember: ExistingBet[] = parsedBets.map((b) => {
        const betIsFP = b.isFreePlay || isFreePlay;
        let betStake: number;
        if (betIsFP && b.isFreePlay) {
          const toWin = b.stake;
          if (b.oddsAmerican > 0) betStake = Math.round((toWin * 100) / b.oddsAmerican);
          else betStake = Math.round((toWin * Math.abs(b.oddsAmerican)) / 100);
          if (betStake <= 0) betStake = Math.round(toWin);
        } else {
          betStake = b.stake > 0 ? Math.round(b.stake) : stake;
        }
        return {
          description: b.description,
          oddsAmerican: Math.round(b.oddsAmerican),
          stakeCashUnits: betIsFP ? 0 : betStake,
          stakeFreePlayUnits: betIsFP ? betStake : 0,
          placedAt: b.placedAt || "",
        };
      });
      setSessionAddedBets((prev) => ({
        ...prev,
        [memberId]: [...(prev[memberId] || []), ...addedForMember],
      }));

      const settledCount = parsedBets.filter(b => b.settled).length;
      const settledMsg = settledCount > 0 ? ` (${settledCount} auto-settled)` : "";
      setBulkSuccess(`${result.created} bet${result.created > 1 ? "s" : ""} added successfully!${settledMsg}`);
      setParsedBets([]);
      setAllScannedBets([]);
      setDescription("");
      setOddsAmerican("");
      setStakeCashUnits("");
      setEventKey("");
      setSport("");
      setBetType("");
      setPlacedAt(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add bets");
    } finally {
      setAddingAll(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBulkSuccess(null);
    if (!memberId || !description || !oddsAmerican || !stakeCashUnits) return;

    setLoading(true);
    try {
      await createBet({
        weekId,
        memberId,
        description,
        eventKey: eventKey || undefined,
        sport: sport || undefined,
        betType: betType || undefined,
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

      {/* AI Scan + Paste Buttons */}
      <div className="space-y-2">
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
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={scanning || parsingText}
            className="py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:from-gray-700 disabled:to-gray-700 text-white font-medium rounded-lg flex items-center justify-center gap-2 transition-all text-sm"
          >
            {scanning ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Scanning...
              </>
            ) : (
              <>
                <Camera size={16} />
                <Sparkles size={12} />
                Scan Slip
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              setShowPasteBox(!showPasteBox);
              setBulkSuccess(null);
            }}
            disabled={scanning || parsingText}
            className={`py-3 font-medium rounded-lg flex items-center justify-center gap-2 transition-all text-sm ${
              showPasteBox
                ? "bg-orange-600 hover:bg-orange-700 text-white"
                : "bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 text-white"
            } disabled:bg-gray-700 disabled:text-gray-500`}
          >
            <ClipboardPaste size={16} />
            Paste Text
          </button>
        </div>
        <p className="text-gray-600 text-xs text-center">
          Upload a screenshot or paste text from your sportsbook — AI extracts all bets
        </p>
      </div>

      {/* Paste Text Box */}
      {showPasteBox && (
        <div className="bg-gray-900 rounded-xl border border-orange-500/30 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-orange-400 font-medium">Paste Bet History</span>
            <button
              type="button"
              onClick={() => {
                setShowPasteBox(false);
                setPasteText("");
              }}
              className="text-gray-500 hover:text-gray-300"
            >
              <X size={14} />
            </button>
          </div>
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder="Paste your bet history or active bets text here... Include timestamps, odds, stakes — AI will extract everything."
            rows={6}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 resize-y"
          />
          <button
            type="button"
            onClick={handleParseText}
            disabled={parsingText || !pasteText.trim()}
            className="w-full py-2.5 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium rounded-lg flex items-center justify-center gap-2 transition-colors text-sm"
          >
            {parsingText ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Parsing bets...
              </>
            ) : (
              <>
                <Sparkles size={14} />
                Parse Bets
              </>
            )}
          </button>
        </div>
      )}

      {/* Scan Preview */}
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

      {/* Scan error without preview (from paste) */}
      {!previewUrl && scanError && (
        <p className="text-red-400 text-xs">{scanError}</p>
      )}

      {/* Bulk Success */}
      {bulkSuccess && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 flex items-center gap-2">
          <CheckCircle2 size={16} className="text-green-400" />
          <p className="text-green-400 text-sm font-medium">{bulkSuccess}</p>
        </div>
      )}

      {/* Multiple Bets Detected — with Add All button */}
      {parsedBets.length > 1 && (
        <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-purple-400 text-xs font-medium">
              {parsedBets.length} bets detected
              {parsedBets.filter(b => b.settled).length > 0 && (
                <span className="text-green-400 ml-1">
                  ({parsedBets.filter(b => b.settled).length} settled)
                </span>
              )}
            </p>
            {memberId && (
              <button
                type="button"
                onClick={handleAddAll}
                disabled={addingAll || !memberId}
                className="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 text-white text-xs font-medium rounded-lg flex items-center gap-1.5 transition-colors"
              >
                {addingAll ? (
                  <>
                    <Loader2 size={12} className="animate-spin" />
                    Adding...
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={12} />
                    Add All {parsedBets.length}
                  </>
                )}
              </button>
            )}
          </div>
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
                {b.isFreePlay && (
                  <span className="text-blue-400 mr-1">🎰 FP</span>
                )}
                {b.settled && (
                  <span className={`mr-1 ${
                    b.settled === "WIN" ? "text-green-400" : b.settled === "LOSS" ? "text-red-400" : "text-gray-400"
                  }`}>
                    {b.settled === "WIN" ? "✓" : b.settled === "LOSS" ? "✗" : "—"}
                  </span>
                )}
                {b.description} ({b.oddsAmerican > 0 ? "+" : ""}
                {b.oddsAmerican})
                {b.stake > 0 && ` · ${b.stake}${b.isFreePlay ? " to win" : " units"}`}
                {b.settled && b.profitAmount != null && (
                  <span className={`ml-1 font-medium ${b.profitAmount > 0 ? "text-green-400" : b.profitAmount < 0 ? "text-red-400" : "text-gray-400"}`}>
                    {b.profitAmount > 0 ? "+" : ""}{b.profitAmount}
                  </span>
                )}
                {(b.sport || b.betType) && (
                  <span className="text-purple-400/60 ml-1">· {[b.sport, b.betType].filter(Boolean).join("/")}</span>
                )}
                {b.placedAt && (
                  <span className="text-gray-600 ml-1">· {b.placedAt}</span>
                )}
              </button>
            ))}
          </div>
          {!memberId && (
            <p className="text-yellow-400 text-xs">
              Select a member above to use Add All
            </p>
          )}
        </div>
      )}

      {/* Single parsed bet — show Add All for 1 bet too */}
      {parsedBets.length === 1 && memberId && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleAddAll}
            disabled={addingAll}
            className="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 text-white text-xs font-medium rounded-lg flex items-center gap-1.5 transition-colors"
          >
            {addingAll ? (
              <>
                <Loader2 size={12} className="animate-spin" />
                Adding...
              </>
            ) : (
              <>
                <CheckCircle2 size={12} />
                Quick Add
              </>
            )}
          </button>
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
