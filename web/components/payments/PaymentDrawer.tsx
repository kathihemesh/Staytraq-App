import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Check, MessageSquare, AlertTriangle, Link, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Payment } from "./usePaymentFilters";
import { StatusBadge } from "./StatusBadge";
import { PaymentTimeline } from "./PaymentTimeline";
import { VerificationPanel } from "./VerificationPanel";

interface PaymentDrawerProps {
  payment: Payment | null;
  isOpen: boolean;
  onClose: () => void;
  onMarkPaid: (id: string, tenantName: string, roomNumber: string) => void;
  onApprovePayment: (id: string, tenantName: string, roomNumber: string) => void;
  onRejectPayment: (id: string, tenantName: string, roomNumber: string, notes: string) => void;
}

export function PaymentDrawer({ payment, isOpen, onClose, onMarkPaid, onApprovePayment, onRejectPayment }: PaymentDrawerProps) {
  // ESC key support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const handleMarkPaid = () => {
    if (!payment) return;
    onMarkPaid(payment.id, payment.tenantName, payment.roomNumber);
    // Optionally close drawer on action, or keep it open to show the updated state
  };

  const handleSendReminder = () => {
    // Mock action
    alert(`Reminder sent to ${payment?.tenantName} for Room ${payment?.roomNumber}`);
  };

  const timelineSteps = payment
    ? [
        {
          label: "Generated",
          sub: `Due ${new Date(payment.dueDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`,
          done: true,
        },
        {
          label: "Received",
          sub:
            payment.status === "paid" && payment.paidDate
              ? `Paid ${new Date(payment.paidDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`
              : "Awaiting payment",
          done: payment.status === "paid",
          active: payment.status !== "paid",
        },
      ]
    : [];

  return (
    <AnimatePresence>
      {isOpen && payment && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.4 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/80"
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.34, ease: [0.25, 0.8, 0.25, 1] }}
            className="fixed inset-y-0 right-0 z-50 w-full max-w-md border-l bg-background shadow-2xl overflow-y-auto will-change-transform"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b p-6">
              <div>
                <h2 className="text-xl font-bold tracking-tight">{payment.tenantName}</h2>
                <p className="text-sm text-muted-foreground mt-1">Room {payment.roomNumber}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full">
                <X className="h-5 w-5" />
              </Button>
            </div>

            <div className="p-6 space-y-8">
              {/* Status & Amount Overview */}
              <div className="flex items-center justify-between bg-muted/30 p-4 rounded-xl border">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">
                    {payment.amount_paid !== undefined && payment.amount_paid > 0 && payment.amount_paid < payment.amount ? "Remaining Balance" : "Total Amount"}
                  </p>
                  <p className="text-3xl font-bold">
                    ₹{(payment.amount_paid !== undefined && payment.amount_paid > 0 && payment.amount_paid < payment.amount
                      ? payment.amount - payment.amount_paid
                      : payment.amount).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={payment.status} />
                  {payment.payment_token && (
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      title="Copy payment link"
                      onClick={() => {
                        const url = `${window.location.origin}/pay/${payment.payment_token}`;
                        navigator.clipboard.writeText(url);
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>

              <PaymentTimeline steps={timelineSteps} fillComplete={payment.status === "paid"} />

              {/* Amount Breakdown */}
              <div>
                <h3 className="font-semibold mb-4 text-sm uppercase tracking-wider text-muted-foreground">Breakdown</h3>
                <div className="space-y-3 bg-muted/20 p-4 rounded-xl border">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Base Rent</span>
                    <span className="font-medium">₹{(payment.baseRent).toLocaleString()}</span>
                  </div>
                  {payment.extraCharges > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-red-500 dark:text-red-400 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Late Fee / Extra</span>
                      <span className="font-medium text-red-500 dark:text-red-400">+ ₹{payment.extraCharges.toLocaleString()}</span>
                    </div>
                  )}
                  {payment.amount_paid !== undefined && payment.amount_paid > 0 && payment.amount_paid < payment.amount && (
                    <div className="flex justify-between text-sm text-blue-600 dark:text-blue-400 font-medium">
                      <span>Already Paid</span>
                      <span>- ₹{payment.amount_paid.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="border-t pt-3 flex justify-between font-bold">
                    <span>{payment.amount_paid !== undefined && payment.amount_paid > 0 && payment.amount_paid < payment.amount ? "Remaining Balance" : "Total"}</span>
                    <span>₹{(payment.amount_paid !== undefined && payment.amount_paid > 0 && payment.amount_paid < payment.amount ? payment.amount - payment.amount_paid : payment.amount).toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Partial Payment Progress Bar */}
              {payment.amount_paid !== undefined && payment.amount_paid > 0 && (
                <div className="bg-blue-500/5 border border-blue-500/20 p-4 rounded-xl flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-extrabold uppercase tracking-widest text-blue-600 dark:text-blue-400">Payment Progress</span>
                    {(payment.amount - payment.amount_paid) > 0 && (
                      <span className="bg-blue-500/10 border border-blue-500/30 px-2 py-0.5 rounded text-[9px] font-black uppercase text-blue-600 dark:text-blue-400">Partial</span>
                    )}
                  </div>
                  <p className="text-sm font-bold text-foreground">
                    Paid ₹{payment.amount_paid.toLocaleString()} of ₹{payment.amount.toLocaleString()}
                  </p>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full"
                      style={{ width: `${Math.min(100, Math.round((payment.amount_paid / payment.amount) * 100))}%` }}
                    />
                  </div>
                  <span className="text-xs font-bold text-blue-600 dark:text-blue-400">
                    Balance ₹{(payment.amount - payment.amount_paid).toLocaleString()}
                  </span>
                </div>
              )}

              {/* Actions */}
              <div className="pt-4 flex flex-col gap-3">
                {payment.status === "submitted" ? (
                  <>
                    <VerificationPanel 
                      payment={payment}
                      onApprove={() => {
                        onApprovePayment(payment.id, payment.tenantName, payment.roomNumber);
                        onClose();
                      }}
                      onReject={(notes) => {
                        onRejectPayment(payment.id, payment.tenantName, payment.roomNumber, notes);
                        onClose();
                      }}
                    />
                    {payment.payment_token && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full gap-2 text-muted-foreground"
                        onClick={() => {
                          const url = `${window.location.origin}/pay/${payment.payment_token}`;
                          navigator.clipboard.writeText(url);
                        }}
                      >
                        <Link className="h-4 w-4" />
                        Copy Payment Link
                      </Button>
                    )}
                  </>
                ) : payment.status !== "paid" ? (
                  <>
                    <Button size="lg" className="w-full gap-2" onClick={handleMarkPaid}>
                      <Check className="h-4 w-4" />
                      Mark as Paid
                    </Button>
                    {payment.payment_token && (
                      <Button
                        size="lg"
                        variant="outline"
                        className="w-full gap-2"
                        onClick={() => {
                          const url = `${window.location.origin}/pay/${payment.payment_token}`;
                          navigator.clipboard.writeText(url);
                        }}
                      >
                        <Link className="h-4 w-4" />
                        Copy Payment Link
                      </Button>
                    )}
                  </>
                ) : (
                  <Button size="lg" variant="secondary" className="w-full gap-2" disabled>
                    <Check className="h-4 w-4 text-emerald-500" />
                    Payment Completed
                  </Button>
                )}
                
                {payment.status !== "submitted" && (
                  <Button size="lg" variant="outline" className="w-full gap-2" onClick={handleSendReminder}>
                    <MessageSquare className="h-4 w-4" />
                    Send Reminder
                  </Button>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
