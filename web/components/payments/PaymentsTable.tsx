import { motion, AnimatePresence } from "framer-motion";
import { InboxIcon, XCircle } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { PaymentRow } from "./PaymentRow";
import { Payment } from "./usePaymentFilters";

interface PaymentsTableProps {
  payments: Payment[];
  isLoading: boolean;
  onRowClick: (payment: Payment) => void;
  onMarkPaid: (id: string, tenantName: string, roomNumber: string) => void;
  onClearFilters: () => void;
  hasActiveFilters: boolean;
}

const containerVariants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.06
    }
  }
};

function SkeletonRow() {
  return (
    <TableRow className="border-b border-border/50 hover:bg-transparent">
      {Array.from({ length: 7 }).map((_, i) => (
        <TableCell key={i}>
          <div 
            className="h-5 w-full rounded bg-muted animate-[pulse_1.5s_ease-in-out_infinite]"
            style={{ 
              opacity: 0.4,
              animation: 'pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite'
            }} 
          />
        </TableCell>
      ))}
    </TableRow>
  );
}

export function PaymentsTable({
  payments,
  isLoading,
  onRowClick,
  onMarkPaid,
  onClearFilters,
  hasActiveFilters
}: PaymentsTableProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.3 }}
      className="rounded-lg border bg-card shadow-sm"
    >
      <div className="max-h-[600px] overflow-y-auto custom-scrollbar">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/75">
            <TableRow className="hover:bg-transparent border-b-border/50">
              <TableHead className="font-semibold text-muted-foreground">Tenant</TableHead>
              <TableHead className="font-semibold text-muted-foreground">Room</TableHead>
              <TableHead className="font-semibold text-muted-foreground">Amount</TableHead>
              <TableHead className="font-semibold text-muted-foreground">Due Date</TableHead>
              <TableHead className="font-semibold text-muted-foreground">Paid Date</TableHead>
              <TableHead className="font-semibold text-muted-foreground">Status</TableHead>
              <TableHead className="w-[140px] font-semibold text-muted-foreground">Action</TableHead>
            </TableRow>
          </TableHeader>
          
          <AnimatePresence mode="wait">
            {isLoading ? (
              <motion.tbody
                key="skeleton"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                {Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)}
              </motion.tbody>
            ) : payments.length > 0 ? (
              <motion.tbody
                key="content"
                variants={containerVariants}
                initial="hidden"
                animate="show"
              >
                {payments.map(payment => (
                  <PaymentRow
                    key={payment.id}
                    payment={payment}
                    onRowClick={onRowClick}
                    onMarkPaid={onMarkPaid}
                  />
                ))}
              </motion.tbody>
            ) : null}
          </AnimatePresence>
        </Table>

        {/* Empty State */}
        {!isLoading && payments.length === 0 && (
          <AnimatePresence>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex flex-col items-center justify-center py-20 px-4 text-center"
            >
              <div className="relative mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-muted/30">
                {/* Custom animated empty inbox SVG illustration */}
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  className="h-12 w-12 text-muted-foreground opacity-60"
                >
                  <motion.path
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 1, ease: "easeInOut" }}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-semibold mb-2">No payments found</h3>
              <p className="text-sm text-muted-foreground max-w-sm mb-6">
                {hasActiveFilters 
                  ? "We couldn't find any payments matching your current filters. Try adjusting your search or status."
                  : "There are no payment records for this month."}
              </p>
              {hasActiveFilters && (
                <Button variant="outline" onClick={onClearFilters} className="rounded-full">
                  <XCircle className="mr-2 h-4 w-4" />
                  Clear Filters
                </Button>
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </motion.div>
  );
}
