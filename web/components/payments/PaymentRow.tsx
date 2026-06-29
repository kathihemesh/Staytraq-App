import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check } from "lucide-react";
import { TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Payment } from "./usePaymentFilters";
import { StatusBadge } from "./StatusBadge";

interface PaymentRowProps {
  payment: Payment;
  onRowClick: (payment: Payment) => void;
  onMarkPaid: (id: string, paymentName: string, room: string) => void;
}

const itemVariants = {
  hidden: { opacity: 0, x: -16 },
  show: { opacity: 1, x: 0 },
  exit: { opacity: 0, y: -8 }
};

export function PaymentRow({ payment, onRowClick, onMarkPaid }: PaymentRowProps) {
  const [isMarking, setIsMarking] = useState(false);

  const handleMarkPaid = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent row click
    setIsMarking(true);
    // Optimistic UI handled by parent immediately, but we can do a local visual confirm
    onMarkPaid(payment.id, payment.tenantName, payment.roomNumber);
  };

  const statusBorderColors = {
    paid: "border-l-emerald-500",
    pending: "border-l-amber-500",
    late: "border-l-red-500",
    submitted: "border-l-blue-500"
  };

  return (
    <motion.tr
      layout
      variants={itemVariants}
      exit="exit"
      onClick={() => onRowClick(payment)}
      className={`
        relative cursor-pointer border-b border-border/50
        transition-colors duration-200
        hover:bg-[rgba(255,255,255,0.04)]
        border-l-[3px] border-l-transparent
        hover:${statusBorderColors[payment.status]}
      `}
    >
      <TableCell className="font-medium">{payment.tenantName}</TableCell>
      <TableCell>{payment.roomNumber}</TableCell>
      <TableCell className="font-medium text-muted-foreground">
        ₹{(payment.amount_paid && payment.amount_paid > 0 && payment.amount_paid < payment.amount
          ? payment.amount - payment.amount_paid
          : payment.amount).toLocaleString()}
      </TableCell>
      <TableCell>
        {new Date(payment.dueDate).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })}
      </TableCell>
      <TableCell>
        {payment.paidDate
          ? new Date(payment.paidDate).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })
          : "—"}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1.5">
          <StatusBadge status={payment.status} />
          {payment.amount_paid && payment.amount_paid > 0 && payment.amount_paid < payment.amount && (
            <span className="bg-blue-500/10 border border-blue-500/30 px-1.5 py-0.5 rounded text-[10px] font-black uppercase text-blue-600 dark:text-blue-400">
              Partial
            </span>
          )}
        </div>
      </TableCell>
      <TableCell>
        <AnimatePresence mode="wait">
          {payment.status !== "paid" ? (
            <motion.div
              key="button"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
            >
              <Button
                size="sm"
                variant="outline"
                onClick={handleMarkPaid}
                disabled={isMarking}
                className="h-8 transition-transform hover:scale-105 active:scale-95"
              >
                <Check className="mr-1.5 h-3 w-3" />
                Mark Paid
              </Button>
            </motion.div>
          ) : (
            <motion.div
              key="paid"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 400, damping: 15 }}
              className="flex items-center gap-1.5 text-sm font-medium text-emerald-500 dark:text-emerald-400"
            >
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/20">
                <Check className="h-3.5 w-3.5" />
              </div>
              <span className="hidden sm:inline">Paid</span>
            </motion.div>
          )}
        </AnimatePresence>
      </TableCell>
    </motion.tr>
  );
}
