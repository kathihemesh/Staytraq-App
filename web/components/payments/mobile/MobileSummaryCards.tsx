"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IndianRupee, Clock, AlertTriangle, type LucideIcon } from "lucide-react";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from "@/components/ui/carousel";
import { useCountUp } from "../useCountUp";
import { cn } from "@/lib/utils";

interface MobileSummaryCardsProps {
  totalCollected: number;
  totalPending: number;
  totalLate: number;
  totalSubmitted: number;
}

const AUTO_ADVANCE_MS = 3500;
const PAUSE_MS = 5000;

type SummaryCard = {
  title: string;
  amount: number;
  finalAmount: number;
  icon: LucideIcon;
  text: string;
  border: string;
  bg: string;
};

function SummaryCardBox({ card }: { card: SummaryCard }) {
  const Icon = card.icon;
  return (
    <div
      className={cn(
        "flex w-full items-center gap-3 rounded-xl border px-4 py-3.5",
        "min-h-[80px]",
        card.text,
        card.border,
        card.bg
      )}
    >
      <Icon className="h-5 w-5 shrink-0 opacity-80" />
      <div className="min-w-0 flex-1 text-left">
        <p className="text-[11px] font-semibold uppercase tracking-wide opacity-80">{card.title}</p>
        <p
          className={cn(
            "font-bold tabular-nums leading-snug",
            card.finalAmount > 999999 ? "text-sm" : card.finalAmount > 99999 ? "text-base" : "text-lg"
          )}
        >
          ₹{card.amount.toLocaleString()}
        </p>
      </div>
    </div>
  );
}

export function MobileSummaryCards({ totalCollected, totalPending, totalLate, totalSubmitted }: MobileSummaryCardsProps) {
  const collectedAnimated = useCountUp(totalCollected, 800);
  const pendingAnimated = useCountUp(totalPending, 800);
  const lateAnimated = useCountUp(totalLate, 800);
  const submittedAnimated = useCountUp(totalSubmitted, 800);

  const [api, setApi] = useState<CarouselApi>();
  const [activeIndex, setActiveIndex] = useState(0);
  const pausedRef = useRef(false);
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cards: SummaryCard[] = [
    {
      title: "Collected",
      amount: collectedAnimated,
      finalAmount: totalCollected,
      icon: IndianRupee,
      text: "text-emerald-700 dark:text-emerald-400",
      border: "border-emerald-300 dark:border-emerald-500/40",
      bg: "bg-emerald-50 dark:bg-emerald-500/10",
    },
    {
      title: "Pending",
      amount: pendingAnimated,
      finalAmount: totalPending,
      icon: Clock,
      text: "text-amber-700 dark:text-amber-400",
      border: "border-amber-300 dark:border-amber-500/40",
      bg: "bg-amber-50 dark:bg-amber-500/10",
    },
    {
      title: "Late",
      amount: lateAnimated,
      finalAmount: totalLate,
      icon: AlertTriangle,
      text: "text-red-700 dark:text-red-400",
      border: "border-red-300 dark:border-red-500/40",
      bg: "bg-red-50 dark:bg-red-500/10",
    },
    {
      title: "Verification",
      amount: submittedAnimated,
      finalAmount: totalSubmitted,
      icon: Clock,
      text: "text-purple-700 dark:text-purple-400",
      border: "border-purple-300 dark:border-purple-500/40",
      bg: "bg-purple-50 dark:bg-purple-500/10",
    },
  ];

  const clearPauseTimer = useCallback(() => {
    if (pauseTimerRef.current) {
      clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = null;
    }
  }, []);

  const pauseAutoPlay = useCallback(() => {
    pausedRef.current = true;
    clearPauseTimer();
    pauseTimerRef.current = setTimeout(() => {
      pausedRef.current = false;
      pauseTimerRef.current = null;
    }, PAUSE_MS);
  }, [clearPauseTimer]);

  useEffect(() => {
    if (!api) return;

    const onSelect = () => setActiveIndex(api.selectedScrollSnap());
    onSelect();
    api.on("select", onSelect);
    api.on("reInit", onSelect);

    return () => {
      api.off("select", onSelect);
      api.off("reInit", onSelect);
    };
  }, [api]);

  useEffect(() => {
    if (!api) return;

    const interval = window.setInterval(() => {
      if (!pausedRef.current) api.scrollNext();
    }, AUTO_ADVANCE_MS);

    return () => window.clearInterval(interval);
  }, [api]);

  useEffect(() => () => clearPauseTimer(), [clearPauseTimer]);

  return (
    <div
      className="relative mb-0 flex flex-col"
      onPointerDown={pauseAutoPlay}
      onTouchStart={pauseAutoPlay}
    >
      <Carousel
        setApi={setApi}
        opts={{ align: "start", loop: true }}
        className="w-full"
      >
        <CarouselContent className="-ml-2.5">
          {cards.map((card) => (
            <CarouselItem key={card.title} className="basis-[88%] pl-2.5 sm:basis-[75%]">
              <SummaryCardBox card={card} />
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>

      <div className="mt-2.5 flex justify-center gap-1.5">
        {cards.map((card, i) => (
          <button
            key={card.title}
            type="button"
            aria-label={`Go to ${card.title}`}
            onClick={() => {
              pauseAutoPlay();
              api?.scrollTo(i);
            }}
            className={cn(
              "h-1.5 rounded-full transition-all duration-300",
              i === activeIndex ? "w-5 bg-foreground/80" : "w-1.5 bg-muted-foreground/35"
            )}
          />
        ))}
      </div>
    </div>
  );
}
