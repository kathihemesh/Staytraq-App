"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, X, ArrowDownUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { SortField, SortDirection } from "../usePaymentFilters";

interface MobileFilterBarProps {
  searchValue: string;
  onSearchChange: (val: string) => void;
  statusFilter: string;
  onStatusChange: (val: string) => void;
  sortField: SortField;
  sortDirection: SortDirection;
  onToggleSort: (field: SortField) => void;
  selectedMonth: string;
  onMonthChange: (val: string) => void;
}

export function MobileFilterBar({
  searchValue,
  onSearchChange,
  statusFilter,
  onStatusChange,
  sortField,
  sortDirection,
  onToggleSort,
  selectedMonth,
  onMonthChange,
}: MobileFilterBarProps) {
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  const recentMonths = useMemo(() => {
    const months: string[] = [];
    const d = new Date();
    for (let i = 0; i < 6; i++) {
      months.push(`${d.toLocaleString("en-US", { month: "long" })} ${d.getFullYear()}`);
      d.setMonth(d.getMonth() - 1);
    }
    return months;
  }, []);

  const statuses = [
    { id: "all", label: "All", activeColor: "bg-primary text-primary-foreground" },
    { id: "paid", label: "Paid", activeColor: "bg-emerald-500 text-white" },
    { id: "pending", label: "Pending", activeColor: "bg-amber-500 text-white" },
    { id: "late", label: "Late", activeColor: "bg-red-500 text-white" },
    { id: "submitted", label: "Submitted", activeColor: "bg-purple-500 text-white" },
  ];

  return (
    <div className="flex flex-col gap-2 mb-2">
      {/* Row 1: Search */}
      <div className="relative flex items-center">
        <Search className="absolute left-3 z-10 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Search tenants or rooms..."
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          onFocus={() => setIsSearchFocused(true)}
          onBlur={() => setIsSearchFocused(false)}
          className="pl-9 pr-8 h-10 bg-muted/30 text-sm"
        />
        <AnimatePresence>
          {searchValue && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              onClick={() => onSearchChange("")}
              className="absolute right-2 p-1 rounded-full hover:bg-muted/50 text-muted-foreground"
            >
              <X className="h-4 w-4" />
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Row 2: Status pills – horizontal scroll */}
      <div
        className="flex gap-1.5 overflow-x-auto scrollbar-none pb-0.5"
        style={{ scrollSnapType: "x mandatory" }}
      >
        {statuses.map((status) => {
          const isActive = statusFilter === status.id;
          return (
            <button
              key={status.id}
              onClick={() => onStatusChange(status.id)}
              style={{ scrollSnapAlign: "start" }}
              className={cn(
                "shrink-0 px-3 h-7 rounded-full text-xs font-medium border transition-colors whitespace-nowrap",
                isActive
                  ? status.activeColor + " border-transparent"
                  : "bg-muted/20 text-muted-foreground border-border/50 hover:text-foreground"
              )}
            >
              {status.label}
            </button>
          );
        })}
      </div>

      {/* Row 3: Month + Sort */}
      <div className="flex gap-2">
        <Select value={selectedMonth} onValueChange={onMonthChange}>
          <SelectTrigger className="flex-1 h-9 text-xs bg-muted/20 rounded-full">
            <SelectValue placeholder="Month" />
          </SelectTrigger>
          <SelectContent>
            {recentMonths.map((m) => (
              <SelectItem key={m} value={m} className="text-xs">
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <button
          onClick={() => onToggleSort(sortField === "amount" ? "dueDate" : "amount")}
          className="flex flex-1 items-center justify-center gap-1.5 h-9 rounded-full border bg-muted/20 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors px-3"
        >
          {sortField === "amount" ? "Amount" : "Due Date"}
          <motion.div
            animate={{ rotate: sortDirection === "desc" ? 180 : 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
          >
            <ArrowDownUp className="h-3.5 w-3.5" />
          </motion.div>
        </button>
      </div>
    </div>
  );
}
