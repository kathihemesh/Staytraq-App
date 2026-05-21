import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, XCircle, AlertCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastType = "success" | "error" | "warning";

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastProps {
  toast: ToastItem;
  onDismiss: (id: string) => void;
}

function ToastComponent({ toast, onDismiss }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(toast.id);
    }, 3000);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  const icons = {
    success: <CheckCircle2 className="h-5 w-5 text-emerald-500" />,
    error: <XCircle className="h-5 w-5 text-red-500" />,
    warning: <AlertCircle className="h-5 w-5 text-amber-500" />,
  };

  const progressColors = {
    success: "bg-emerald-500",
    error: "bg-red-500",
    warning: "bg-amber-500",
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 50, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 20, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
      className="pointer-events-auto relative mb-3 flex w-full max-w-sm items-center gap-3 overflow-hidden rounded-lg border bg-card p-4 shadow-lg"
    >
      <div className="flex-shrink-0">{icons[toast.type]}</div>
      <div className="flex-1 text-sm font-medium">{toast.message}</div>
      <button
        onClick={() => onDismiss(toast.id)}
        className="flex-shrink-0 rounded-md p-1 opacity-50 transition-opacity hover:opacity-100"
      >
        <X className="h-4 w-4" />
      </button>

      {/* Progress Bar */}
      <div className="absolute bottom-0 left-0 h-1 w-full bg-muted/50">
        <div
          className={cn("h-full", progressColors[toast.type])}
          style={{ animation: "toast-progress 3s linear forwards" }}
        />
      </div>
    </motion.div>
  );
}

// Ensure this keyframe exists in globals.css:
// @keyframes toast-progress {
//   from { width: 100%; }
//   to { width: 0%; }
// }

export function ToastContainer({ toasts, onDismiss }: { toasts: ToastItem[], onDismiss: (id: string) => void }) {
  // Only show the 3 most recent toasts
  const visibleToasts = toasts.slice(-3);

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end justify-end pointer-events-none">
      <AnimatePresence mode="popLayout">
        {visibleToasts.map((toast) => (
          <ToastComponent key={toast.id} toast={toast} onDismiss={onDismiss} />
        ))}
      </AnimatePresence>
    </div>
  );
}
