import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: "paid" | "pending" | "late" | "submitted";
}

export function StatusBadge({ status }: StatusBadgeProps) {
  if (status === "paid") {
    return (
      <Badge variant="outline" className="border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 gap-1.5 pl-1.5">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* Animated checkmark using stroke-dasharray and stroke-dashoffset */}
          <path
            d="M20 6L9 17l-5-5"
            style={{
              strokeDasharray: 24,
              strokeDashoffset: 24,
              animation: "dash 0.6s ease-in-out forwards",
            }}
          />
        </svg>
        Paid
      </Badge>
    );
  }

  if (status === "pending") {
    return (
      <Badge variant="outline" className="border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400 gap-1.5 pl-1.5">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="animate-[spin_4s_linear_infinite]"
        >
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        Pending
      </Badge>
    );
  }

  if (status === "submitted") {
    return (
      <Badge variant="outline" className="border-purple-500/20 bg-purple-500/10 text-purple-600 dark:text-purple-400 gap-1.5 pl-1.5 animate-[pulse-badge_2s_ease-in-out_infinite]">
        <div className="h-1.5 w-1.5 rounded-full bg-purple-500 animate-pulse" />
        Verification
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className="border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400 gap-1.5 animate-[pulse-badge_2s_ease-in-out_infinite]"
    >
      <div className="h-1.5 w-1.5 rounded-full bg-red-500" />
      Late
    </Badge>
  );
}

// Ensure these keyframes are available (can be added to globals.css if needed, but Tailwind arbitrary values often work or standard CSS)
// @keyframes dash {
//   to {
//     stroke-dashoffset: 0;
//   }
// }
// @keyframes pulse-badge {
//   0%, 100% { transform: scale(1); }
//   50% { transform: scale(1.05); }
// }
