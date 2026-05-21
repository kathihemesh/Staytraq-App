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
  screenshot_url?: string;
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

  const filteredAndSortedPayments = useMemo(() => {
    let result = [...payments];

    // 1. Filter by Month/Year
    result = result.filter(p => `${p.month} ${p.year}` === selectedMonth);

    // 2. Filter by Search
    if (debouncedSearch) {
      const lowerSearch = debouncedSearch.toLowerCase();
      result = result.filter(p => 
        p.tenantName.toLowerCase().includes(lowerSearch) ||
        p.roomNumber.toLowerCase().includes(lowerSearch)
      );
    }

    // 3. Filter by Status
    if (statusFilter !== "all") {
      result = result.filter(p => p.status === statusFilter);
    }

    // 4. Sort
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
  }, [payments, debouncedSearch, statusFilter, sortField, sortDirection, selectedMonth]);

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
    filteredPayments: filteredAndSortedPayments
  };
}
