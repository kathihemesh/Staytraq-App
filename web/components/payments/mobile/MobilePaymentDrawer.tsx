"use client";

import { useEffect, useState } from "react";
import { X, Check, AlertTriangle, Link } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Payment } from "../usePaymentFilters";
import { StatusBadge } from "../StatusBadge";
import { PaymentTimeline } from "../PaymentTimeline";
import { VerificationPanel } from "../VerificationPanel";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";

interface MobilePaymentDrawerProps {
  payment: Payment | null;
  isOpen: boolean;
  onClose: () => void;
  onMarkPaid: (id: string, tenantName: string, roomNumber: string) => void;
  onApprovePayment: (id: string, tenantName: string, roomNumber: string) => void;
  onRejectPayment: (id: string, tenantName: string, roomNumber: string, notes: string) => void;
}

export function MobilePaymentDrawer({
  payment,
  isOpen,
  onClose,
  onMarkPaid,
  onApprovePayment,
  onRejectPayment,
}: MobilePaymentDrawerProps) {
  const [timelinePlay, setTimelinePlay] = useState(false);

  useEffect(() => {
    if (!isOpen || !payment) {
      setTimelinePlay(false);
      return;
    }
    const timer = window.setTimeout(() => setTimelinePlay(true), 360);
    return () => window.clearTimeout(timer);
  }, [isOpen, payment?.id]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const handleMarkPaid = () => {
    if (!payment) return;
    onMarkPaid(payment.id, payment.tenantName, payment.roomNumber);
  };

  const handleSendReminder = () => {
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
    <Drawer open={isOpen && payment !== null} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent className="max-h-[85vh] h-[85vh] flex flex-col overflow-hidden border-t border-border bg-background shadow-2xl">
        {payment && (
          <>
            <DrawerHeader className="px-5 py-3 border-b border-border text-left shrink-0">
              <div className="flex items-start justify-between w-full">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <DrawerTitle className="text-base font-bold text-foreground">{payment.tenantName}</DrawerTitle>
                    <StatusBadge status={payment.status} />
                  </div>
                  <DrawerDescription className="text-xs text-muted-foreground">
                    Room {payment.roomNumber}
                  </DrawerDescription>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-muted/50 text-muted-foreground -mr-1"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </DrawerHeader>

            <div
              className="flex-1 overflow-y-auto px-5 py-4 space-y-5"
              style={{ WebkitOverflowScrolling: "touch" }}
            >
              <div className="flex items-center justify-between bg-muted/30 p-4 rounded-xl border border-border">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">
                    {payment.amount_paid !== undefined && payment.amount_paid > 0 && payment.amount_paid < payment.amount ? "Remaining Balance" : "Total Amount"}
                  </p>
                  <p className="text-2xl font-bold">
                    ₹{(payment.amount_paid !== undefined && payment.amount_paid > 0 && payment.amount_paid < payment.amount
                      ? payment.amount - payment.amount_paid
                      : payment.amount).toLocaleString()}
                  </p>
                </div>
              </div>

              <PaymentTimeline
                steps={timelineSteps}
                fillComplete={payment.status === "paid"}
                compact
                play={timelinePlay}
              />

              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                  Breakdown
                </h3>
                <div className="space-y-2.5 bg-muted/20 p-3.5 rounded-xl border border-border">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground text-xs">Base Rent</span>
                    <span className="font-medium text-sm">₹{payment.baseRent.toLocaleString()}</span>
                  </div>
                  {payment.extraCharges > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-red-500 flex items-center gap-1 text-xs">
                        <AlertTriangle className="h-3 w-3" /> Extra Charges
                      </span>
                      <span className="font-medium text-red-500 text-sm">
                        + ₹{payment.extraCharges.toLocaleString()}
                      </span>
                    </div>
                  )}
                  {payment.amount_paid !== undefined && payment.amount_paid > 0 && payment.amount_paid < payment.amount && (
                    <div className="flex justify-between text-xs text-blue-600 dark:text-blue-400 font-medium">
                      <span>Already Paid</span>
                      <span>- ₹{payment.amount_paid.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="border-t border-border pt-2 flex justify-between font-bold text-sm">
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
            </div>

            <div
              className="shrink-0 flex flex-col gap-3 px-5 pt-3 pb-3 border-t border-border bg-background"
              style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
            >
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
                      className="w-full gap-2 text-muted-foreground h-9"
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
                  <div className="flex gap-3">
                    <Button size="sm" variant="ghost" className="flex-1 h-10" onClick={handleSendReminder}>
                      Remind
                    </Button>
                    <Button size="sm" className="flex-1 gap-2 h-10" onClick={handleMarkPaid}>
                      <Check className="h-4 w-4" />
                      Mark as Paid
                    </Button>
                  </div>
                  {payment.payment_token && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full gap-2 text-muted-foreground h-9"
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
                <div className="flex w-full items-center justify-center gap-2 h-10 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 rounded-md font-medium text-sm border border-emerald-300 dark:border-emerald-500/40">
                  <Check className="h-4 w-4" />
                  Payment Completed
                </div>
              )}
            </div>
          </>
        )}
      </DrawerContent>
    </Drawer>
  );
}
