import { motion } from "framer-motion";
import { IndianRupee, Clock, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useCountUp } from "./useCountUp";
import { cn } from "@/lib/utils";

interface SummaryCardsProps {
  totalCollected: number;
  totalPending: number;
  totalLate: number;
  totalSubmitted: number;
}

export function SummaryCards({ totalCollected, totalPending, totalLate, totalSubmitted }: SummaryCardsProps) {
  const collectedAnimated = useCountUp(totalCollected, 800);
  const pendingAnimated = useCountUp(totalPending, 800);
  const lateAnimated = useCountUp(totalLate, 800);
  const submittedAnimated = useCountUp(totalSubmitted, 800);

  const cards = [
    {
      title: "Collected",
      amount: collectedAnimated,
      icon: IndianRupee,
      text: "text-emerald-700 dark:text-emerald-400",
      border: "border-emerald-300 dark:border-emerald-500/40",
      bg: "bg-emerald-50 dark:bg-emerald-500/10",
    },
    {
      title: "Pending",
      amount: pendingAnimated,
      icon: Clock,
      text: "text-amber-700 dark:text-amber-400",
      border: "border-amber-300 dark:border-amber-500/40",
      bg: "bg-amber-50 dark:bg-amber-500/10",
    },
    {
      title: "Late",
      amount: lateAnimated,
      icon: AlertTriangle,
      text: "text-red-700 dark:text-red-400",
      border: "border-red-300 dark:border-red-500/40",
      bg: "bg-red-50 dark:bg-red-500/10",
    },
    {
      title: "Verification",
      amount: submittedAnimated,
      icon: Clock,
      text: "text-purple-700 dark:text-purple-400",
      border: "border-purple-300 dark:border-purple-500/40",
      bg: "bg-purple-50 dark:bg-purple-500/10",
    },
  ];

  return (
    <div className="mb-6 grid gap-4 grid-cols-2 lg:grid-cols-4">
      {cards.map((card, index) => (
        <motion.div
          key={card.title}
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: index * 0.1 }}
          whileHover={{ scale: 1.02 }}
          className="h-full"
        >
          <Card
            className={cn(
              "h-full transition-all duration-300 border shadow-sm",
              card.border,
              card.bg
            )}
          >
            <CardContent className="flex items-center gap-4 p-5 h-full">
              <div
                className={cn(
                  "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border bg-white/60 dark:bg-slate-900/40",
                  card.border
                )}
              >
                <card.icon className={cn("h-6 w-6", card.text)} />
              </div>
              <div className="min-w-0">
                <p className={cn("text-sm font-medium", card.text, "opacity-80")}>{card.title}</p>
                <p className="truncate text-xl font-bold sm:text-2xl tabular-nums">
                  ₹{card.amount.toLocaleString()}
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      ))}
    </div>
  );
}
