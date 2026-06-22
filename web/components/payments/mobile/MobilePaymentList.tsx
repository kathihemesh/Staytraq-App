"use client";

import { useRef, useState, useCallback } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform, Variants } from "framer-motion";
import { RefreshCw, XCircle } from "lucide-react";
import { Payment } from "../usePaymentFilters";
import { MobilePaymentCard, MobilePaymentCardSkeleton } from "./MobilePaymentCard";
import { Button } from "@/components/ui/button";

const cardContainerVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
};

const cardItemVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { type: "spring", damping: 20, stiffness: 200 } },
};

interface MobilePaymentListProps {
  payments: Payment[];
  isLoading: boolean;
  totalPayments: number;
  onCardClick: (payment: Payment) => void;
  onMarkPaid: (id: string, tenantName: string, roomNumber: string) => void;
  onClearFilters: () => void;
  hasActiveFilters: boolean;
  onRefresh: () => void;
  selectedMonth: string;
  /** Requests the next page of payments when the list nears its end. Data fetching is owned by the page. */
  onLoadMore?: () => void;
  /** Whether more pages are available to load. When false, no further load-more requests are made. */
  hasMore?: boolean;
  /** Whether a next-page request is currently in flight. */
  isLoadingMore?: boolean;
}

const PULL_THRESHOLD = 64;
/** Distance (px) from the bottom of the scroll container at which the next page is requested. */
const LOAD_MORE_THRESHOLD = 200;

export function MobilePaymentList({
  payments,
  isLoading,
  totalPayments,
  onCardClick,
  onMarkPaid,
  onClearFilters,
  hasActiveFilters,
  onRefresh,
  selectedMonth,
  onLoadMore,
  hasMore = false,
  isLoadingMore = false,
}: MobilePaymentListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const [scrollY, setScrollY] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const pullY = useMotionValue(0);
  const pullOpacity = useTransform(pullY, [0, PULL_THRESHOLD], [0, 1]);
  const pullRotate = useTransform(pullY, [0, PULL_THRESHOLD], [0, 360]);

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const el = e.target as HTMLDivElement;
      setScrollY(el.scrollTop);

      // Scroll-end trigger: request the next page as the user nears the bottom.
      // Current rows stay visible; the page owns the actual data fetch.
      if (onLoadMore && hasMore && !isLoadingMore && !isLoading) {
        const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        if (distanceFromBottom <= LOAD_MORE_THRESHOLD) {
          onLoadMore();
        }
      }
    },
    [onLoadMore, hasMore, isLoadingMore, isLoading]
  );

  const paidCount = payments.filter((p) => p.status === "paid").length;

  const handleRefresh = async () => {
    setIsRefreshing(true);
    onRefresh();
    await new Promise((r) => setTimeout(r, 1000));
    setIsRefreshing(false);
    pullY.set(0);
  };

  return (
    <div className="relative flex-1 flex flex-col overflow-hidden">
      {/* Pull-to-refresh indicator */}
      <motion.div
        style={{ opacity: pullOpacity, height: isRefreshing ? 40 : 0 }}
        className="flex items-center justify-center overflow-hidden"
      >
        <motion.div style={{ rotate: isRefreshing ? undefined : pullRotate }}>
          <RefreshCw
            className={`h-4 w-4 text-muted-foreground ${isRefreshing ? "animate-spin" : ""}`}
          />
        </motion.div>
      </motion.div>

      {/* Scrollable list */}
      <div
        ref={listRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto space-y-2 pb-24 px-0.5"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="relative">
                <MobilePaymentCardSkeleton />
              </div>
            ))}
          </div>
        ) : payments.length > 0 ? (
          <motion.div
            variants={cardContainerVariants}
            initial="hidden"
            animate="show"
            className="space-y-2"
          >
            <AnimatePresence>
              {payments.map((payment) => (
                <motion.div
                  key={payment.id}
                  variants={cardItemVariants}
                  exit={{ opacity: 0, y: -8 }}
                >
                  <MobilePaymentCard
                    payment={payment}
                    onCardClick={onCardClick}
                    onMarkPaid={onMarkPaid}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        ) : (
          <AnimatePresence>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center justify-center py-16 px-4 text-center"
            >
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted/30">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  className="h-8 w-8 text-muted-foreground opacity-60"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                  />
                </svg>
              </div>
              <h3 className="text-base font-semibold mb-1">No payments yet</h3>
              <p className="text-xs text-muted-foreground max-w-[220px] mb-4">
                {hasActiveFilters
                  ? "No payments match your filters."
                  : "No payment records for this month."}
              </p>
              {hasActiveFilters && (
                <Button variant="outline" onClick={onClearFilters} size="sm" className="rounded-full text-xs h-8">
                  <XCircle className="mr-1.5 h-3.5 w-3.5" />
                  Clear Filters
                </Button>
              )}
            </motion.div>
          </AnimatePresence>
        )}

        {/* Load-more footer: keeps current rows visible while the next page loads */}
        {!isLoading && payments.length > 0 && isLoadingMore && (
          <div className="flex items-center justify-center py-4">
            <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
            <span className="ml-2 text-xs text-muted-foreground">Loading more…</span>
          </div>
        )}
      </div>

      {/* Sticky footer */}
      <AnimatePresence>
        {scrollY > 120 && payments.length > 0 && (
          <motion.div
            initial={{ y: 36, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 36, opacity: 0 }}
            className="absolute bottom-0 left-0 right-0 h-9 z-20 flex items-center px-4 border-t border-border bg-background/90 pointer-events-none"
            style={{ 
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              paddingBottom: "max(env(safe-area-inset-bottom), 0px)",
              boxSizing: "content-box"
            }}
          >
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span className="text-[12px] text-muted-foreground">
                {selectedMonth} — {paidCount} paid of {payments.length}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
