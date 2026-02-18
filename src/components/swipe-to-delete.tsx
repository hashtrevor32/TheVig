"use client";

import { useRef, useState, useEffect, type ReactNode } from "react";
import { Trash2 } from "lucide-react";

const DELETE_ZONE = 80;
const SWIPE_THRESHOLD = 40;

export function SwipeToDelete({
  children,
  onDelete,
  label = "Delete",
  disabled = false,
}: {
  children: ReactNode;
  onDelete: () => void | Promise<void>;
  label?: string;
  disabled?: boolean;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [offsetX, setOffsetX] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isSwiping, setIsSwiping] = useState(false);

  const tracking = useRef(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const locked = useRef<"h" | "v" | null>(null);
  const lastDx = useRef(0);
  const didSwipe = useRef(false);

  // Attach native touchmove listener with { passive: false } so we can preventDefault
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el || disabled) return;

    function handleNativeTouchMove(e: TouchEvent) {
      if (!tracking.current || deleting) return;

      const dx = e.touches[0].clientX - startX.current;
      const dy = e.touches[0].clientY - startY.current;

      if (!locked.current) {
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);
        if (absDx < 8 && absDy < 8) return;
        locked.current = absDx > absDy ? "h" : "v";
      }

      if (locked.current === "v") {
        tracking.current = false;
        return;
      }

      // Horizontal — prevent browser scroll and link drag
      e.preventDefault();
      didSwipe.current = true;
      setIsSwiping(true);

      const clamped = dx > 0 ? 0 : Math.max(-(DELETE_ZONE + 30), dx);
      lastDx.current = clamped;
      setOffsetX(clamped);
    }

    el.addEventListener("touchmove", handleNativeTouchMove, { passive: false });
    return () => el.removeEventListener("touchmove", handleNativeTouchMove);
  }, [disabled, deleting]);

  function handleTouchStart(e: React.TouchEvent) {
    if (deleting) return;

    if (isOpen) {
      setIsOpen(false);
      setOffsetX(0);
      e.preventDefault();
      return;
    }

    tracking.current = true;
    locked.current = null;
    lastDx.current = 0;
    didSwipe.current = false;
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
  }

  function handleTouchEnd() {
    if (!tracking.current) return;
    tracking.current = false;
    setIsSwiping(false);

    if (lastDx.current < -SWIPE_THRESHOLD) {
      setOffsetX(-DELETE_ZONE);
      setIsOpen(true);
    } else {
      setOffsetX(0);
      setIsOpen(false);
    }
  }

  // Block link clicks if we just swiped
  function handleClickCapture(e: React.MouseEvent) {
    if (didSwipe.current || isOpen) {
      e.preventDefault();
      e.stopPropagation();
      if (isOpen && !deleting) {
        setIsOpen(false);
        setOffsetX(0);
      }
      didSwipe.current = false;
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await onDelete();
    } catch {
      setDeleting(false);
      setOffsetX(0);
      setIsOpen(false);
    }
  }

  if (disabled) {
    return <>{children}</>;
  }

  const showDelete = offsetX < -10;

  return (
    <div ref={wrapperRef} className="relative overflow-hidden rounded-xl">
      {/* Delete button behind */}
      <div
        className="absolute inset-y-0 right-0 flex items-center justify-center bg-red-600 rounded-r-xl"
        style={{
          width: DELETE_ZONE,
          opacity: showDelete ? 1 : 0,
          transition: "opacity 0.15s",
          pointerEvents: showDelete ? "auto" : "none",
        }}
      >
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="flex flex-col items-center gap-1 text-white w-full h-full justify-center"
        >
          {deleting ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <Trash2 size={18} />
          )}
          <span className="text-[10px] font-medium">
            {deleting ? "..." : label}
          </span>
        </button>
      </div>

      {/* Swipeable content — captures clicks to block link nav after swipe */}
      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onClickCapture={handleClickCapture}
        style={{
          transform: `translateX(${offsetX}px)`,
          transition: isSwiping ? "none" : "transform 0.25s ease-out",
          willChange: "transform",
        }}
      >
        {children}
      </div>
    </div>
  );
}
