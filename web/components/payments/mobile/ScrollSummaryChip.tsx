"use client";

import { motion, AnimatePresence } from "framer-motion";

interface ScrollSummaryChipProps {
  paidCount: number;
  totalCount: number;
  visible: boolean;
}

export function ScrollSummaryChip({ paidCount, totalCount, visible }: ScrollSummaryChipProps) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.9 }}
          transition={{ type: "spring", damping: 20, stiffness: 300 }}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 pointer-events-none"
        >
          <div
            className="flex items-center gap-1.5 rounded-full border border-border bg-background/90 shadow-md px-3 py-1.5 text-xs font-medium text-foreground"
            style={{ backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}
          >
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            {paidCount} of {totalCount} paid
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
