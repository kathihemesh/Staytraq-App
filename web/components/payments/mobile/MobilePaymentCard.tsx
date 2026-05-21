"use client";

import { useState, useCallback, useEffect } from "react";
import { motion, animate, AnimatePresence } from "framer-motion";
import { Check } from "lucide-react";
import { Payment } from "../usePaymentFilters";
import { StatusBadge } from "../StatusBadge";

interface MobilePaymentCardProps {
  payment: Payment;
  onCardClick: (payment: Payment) => void;
  onMarkPaid: (id: string, tenantName: string, roomNumber: string) => void;
  style?: React.CSSProperties;
}

const amountColors: Record<string, string> = {
  paid: "text-emerald-500",
  pending: "text-amber-500",
  late: "text-red-500",
  submitted: "text-purple-500",
};

export function MobilePaymentCard({ payment, onCardClick, onMarkPaid, style }: MobilePaymentCardProps) {
  const [cardRef, setCardRef] = useState<HTMLDivElement | null>(null);
  const [isMarking, setIsMarking] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  const handleMarkPaid = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (isMarking || payment.status === "paid") return;
      setIsMarking(true);
      setShowConfetti(true);

      // Green flash animation
      if (cardRef) {
        animate(
          cardRef,
          { backgroundColor: ["transparent", "rgba(34,197,94,0.15)", "transparent"] },
          { duration: 0.4, ease: "easeInOut" }
        );
      }

      setTimeout(() => {
        onMarkPaid(payment.id, payment.tenantName, payment.roomNumber);
      }, 600); // Wait for confetti before removing mark paid button
    },
    [cardRef, isMarking, onMarkPaid, payment]
  );

  const formattedDue = new Date(payment.dueDate).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });

  return (
    <motion.div
      ref={setCardRef}
      style={style}
      onClick={() => onCardClick(payment)}
      className="relative flex items-center gap-3 rounded-xl rounded-l-none border bg-card px-3 py-2.5 shadow-sm active:scale-[0.99] transition-transform cursor-pointer overflow-hidden"
    >
      {/* Left status accent bar */}
      <div
        className={`absolute left-0 top-0 bottom-0 w-[3px] ${
          payment.status === "paid"
            ? "bg-emerald-500"
            : payment.status === "pending"
            ? "bg-amber-500"
            : "bg-red-500"
        }`}
      />

      {/* Card content */}
      <div className="flex-1 min-w-0 pl-2">
        {/* Row 1 */}
        <div className="flex items-center justify-between gap-2">
          <p className="text-[13px] font-semibold truncate leading-snug">{payment.tenantName}</p>
          <p className={`text-[14px] font-bold shrink-0 ${amountColors[payment.status]}`}>
            ₹{payment.amount.toLocaleString()}
          </p>
        </div>

        {/* Row 2 */}
        <div className="flex items-center justify-between gap-1 mt-0.5">
          <p className="text-[11px] text-muted-foreground truncate">Room {payment.roomNumber}</p>
          <p className="text-[11px] text-muted-foreground shrink-0">Due {formattedDue}</p>
          <div className="shrink-0">
            <StatusBadge status={payment.status} />
          </div>
        </div>
      </div>

      {/* Mark Paid icon button */}
      <div className="relative shrink-0">
        {payment.status !== "paid" && (
          <button
            onClick={handleMarkPaid}
            disabled={isMarking}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-500 transition-colors hover:bg-emerald-500/20 active:scale-90"
          >
            <Check className="h-4 w-4" />
          </button>
        )}

        {payment.status === "paid" && (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/10">
            <Check className="h-4 w-4 text-emerald-500" />
          </div>
        )}

        <AnimatePresence>
          {showConfetti && (
            <div className="absolute top-1/2 left-1/2 pointer-events-none z-10">
              {Array.from({ length: 12 }).map((_, i) => (
                <motion.div
                  key={i}
                  initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                  animate={{
                    x: (Math.random() - 0.5) * 120,
                    y: (Math.random() * -60) - 20,
                    opacity: 0,
                    scale: 0,
                  }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                  className={`absolute h-[6px] w-[6px] ${['bg-emerald-500', 'bg-amber-500', 'bg-white'][i % 3]} rounded-sm`}
                  style={{ marginLeft: -3, marginTop: -3 }}
                />
              ))}
            </div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// Skeleton variant
export function MobilePaymentCardSkeleton() {
  return (
    <div className="relative flex items-center gap-3 rounded-xl rounded-l-none border bg-card px-3 py-2.5 overflow-hidden">
      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-muted" />
      <div className="flex-1 pl-2 space-y-2">
        <div className="flex justify-between gap-2">
          <div className="h-4 w-28 rounded bg-muted skeleton-pulse" />
          <div className="h-4 w-16 rounded bg-muted skeleton-pulse" />
        </div>
        <div className="flex justify-between gap-1">
          <div className="h-3 w-16 rounded bg-muted skeleton-pulse" />
          <div className="h-3 w-14 rounded bg-muted skeleton-pulse" />
          <div className="h-3 w-12 rounded bg-muted skeleton-pulse" />
        </div>
      </div>
      <div className="h-8 w-8 rounded-full bg-muted skeleton-pulse" />
    </div>
  );
}
