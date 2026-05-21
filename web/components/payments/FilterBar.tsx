import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, X, ArrowDownUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { SortField, SortDirection, Payment } from "./usePaymentFilters";

interface FilterBarProps {
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

export function FilterBar({
  searchValue,
  onSearchChange,
  statusFilter,
  onStatusChange,
  sortField,
  sortDirection,
  onToggleSort,
  selectedMonth,
  onMonthChange,
}: FilterBarProps) {
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // Generate last 6 months
  const recentMonths = useMemo(() => {
    const months = [];
    const d = new Date();
    for (let i = 0; i < 6; i++) {
      months.push(`${d.toLocaleString("en-US", { month: "long" })} ${d.getFullYear()}`);
      d.setMonth(d.getMonth() - 1);
    }
    return months;
  }, []);

  const statuses = [
    { id: "all", label: "All" },
    { id: "paid", label: "Paid", activeColor: "bg-emerald-500 text-white dark:bg-emerald-600" },
    { id: "pending", label: "Pending", activeColor: "bg-amber-500 text-white dark:bg-amber-600" },
    { id: "late", label: "Late", activeColor: "bg-red-500 text-white dark:bg-red-600" },
    { id: "submitted", label: "Submitted", activeColor: "bg-purple-500 text-white dark:bg-purple-600" },
  ];

  return (
    <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      {/* Left side: Search */}
      <div className="relative flex-1 max-w-sm flex items-center">
        <motion.div
          initial={false}
          animate={{
            x: isSearchFocused || searchValue ? 12 : 12,
            scale: isSearchFocused || searchValue ? 0.9 : 1,
            opacity: 0.5
          }}
          className="absolute z-10 pointer-events-none"
        >
          <Search className="h-4 w-4" />
        </motion.div>
        
        <Input
          placeholder="Search tenants or rooms..."
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          onFocus={() => setIsSearchFocused(true)}
          onBlur={() => setIsSearchFocused(false)}
          className="pl-9 pr-8 bg-muted/30 focus:bg-background transition-colors"
        />

        <AnimatePresence>
          {searchValue && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              onClick={() => onSearchChange("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted/50 text-muted-foreground"
            >
              <X className="h-4 w-4" />
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Right side: Filters & Actions */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Pill Toggles */}
        <div className="flex items-center gap-1 rounded-full border bg-muted/20 p-1">
          {statuses.map((status) => {
            const isActive = statusFilter === status.id;
            return (
              <button
                key={status.id}
                onClick={() => onStatusChange(status.id)}
                className={cn(
                  "relative px-4 py-1.5 text-sm font-medium rounded-full transition-colors",
                  isActive ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId="activePill"
                    className={cn(
                      "absolute inset-0 rounded-full",
                      status.activeColor || "bg-primary"
                    )}
                    initial={false}
                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                  />
                )}
                <span className="relative z-10">{status.label}</span>
              </button>
            );
          })}
        </div>

        {/* Month Picker */}
        <Select value={selectedMonth} onValueChange={onMonthChange}>
          <SelectTrigger className="w-[160px] rounded-full bg-muted/20">
            <SelectValue placeholder="Select Month" />
          </SelectTrigger>
          <SelectContent>
            {recentMonths.map(m => (
              <SelectItem key={m} value={m}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Sort Toggle */}
        <Button
          variant="outline"
          className="rounded-full gap-2 px-4"
          onClick={() => onToggleSort(sortField === "amount" ? "dueDate" : "amount")}
        >
          Sort: {sortField === "amount" ? "Amount" : "Due Date"}
          <motion.div
            animate={{ rotate: sortDirection === "desc" ? 180 : 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
          >
            <ArrowDownUp className="h-4 w-4" />
          </motion.div>
        </Button>

      </div>
    </div>
  );
}
