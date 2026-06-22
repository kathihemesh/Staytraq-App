import { useState, useMemo, useRef, useCallback, useEffect } from "react";

export interface Payment {
  id: string;
  tenantName: string;
  roomNumber: string;
  amount: number;
  baseRent: number;
  extraCharges: number;
  status: "paid" | "pending" | "late" | "submitted";
  dueDate: string;
  paidDate?: string;
  month: string;
  year: number;
  payment_token?: string;
  // Storage object path for the proof screenshot. The list never resolves this to a
  // signed URL; the detail view requests a fresh signed URL on open (see
  // VerificationPanel). Null/undefined means the record has no screenshot.
  screenshot_path?: string | null;
  utr_number?: string;
  verification_notes?: string;
}

export type SortField = "amount" | "dueDate";
export type SortDirection = "asc" | "desc";

export function usePaymentFilters(payments: Payment[]) {
  const [searchValue, setSearchValue] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("dueDate");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  
  // Default to current month/year
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const d = new Date();
    const monthStr = d.toLocaleString("en-US", { month: "long" });
    const yearStr = d.getFullYear();
    return `${monthStr} ${yearStr}`;
  });

  const searchTimeout = useRef<NodeJS.Timeout | null>(null);

  const handleSearchChange = useCallback((val: string) => {
    setSearchValue(val);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setDebouncedSearch(val);
    }, 300);
  }, []);

  // Cleanup timeout
  useEffect(() => {
    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
  }, []);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("desc"); // Default new sort to desc
    }
  };

  // Month/year, status, and search filtering now happen server-side via the
  // payments-page RPCs (see web/lib/payments/payments-page.ts). The hook retains
  // that UI state (selectedMonth, statusFilter, debouncedSearch) so the page can
  // forward it to the server, but it no longer filters the dataset locally.
  //
  // Only the in-page sort is applied client-side, over the deterministic server
  // order, so the already-loaded rows can be reordered without a refetch.
  const filteredAndSortedPayments = useMemo(() => {
    const result = [...payments];

    result.sort((a, b) => {
      let comparison = 0;
      if (sortField === "amount") {
        comparison = a.amount - b.amount;
      } else if (sortField === "dueDate") {
        comparison = new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      }

      return sortDirection === "asc" ? comparison : -comparison;
    });

    return result;
  }, [payments, sortField, sortDirection]);

  return {
    searchValue,
    setSearchValue: handleSearchChange,
    statusFilter,
    setStatusFilter,
    sortField,
    sortDirection,
    toggleSort,
    selectedMonth,
    setSelectedMonth,
    // Debounced search value, exposed so the page can drive the server-side
    // search RPC (the hook no longer filters the dataset locally).
    debouncedSearch,
    filteredPayments: filteredAndSortedPayments
  };
}
