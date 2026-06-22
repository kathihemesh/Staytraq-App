import { useState, useEffect } from "react";
import { Check, X, Maximize2, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Payment } from "./usePaymentFilters";
import { Textarea } from "@/components/ui/textarea";

interface VerificationPanelProps {
  payment: Payment;
  onApprove: () => void;
  onReject: (notes: string) => void;
}

export function VerificationPanel({ payment, onApprove, onReject }: VerificationPanelProps) {
  const [rejectNotes, setRejectNotes] = useState("");
  const [isRejecting, setIsRejecting] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [isLoadingImage, setIsLoadingImage] = useState(false);

  // Resolve a fresh signed URL whenever the detail view opens for a record that
  // has a screenshot path. This component mounts on drawer open, so the request
  // runs on every open (no caching across opens), per Req 7.2. Records with no
  // screenshot_path request nothing (Req 7.3).
  useEffect(() => {
    if (!payment.screenshot_path) return;
    setIsLoadingImage(true);
    fetch(`/api/payments/${payment.id}/screenshot`)
      .then((res) => res.json())
      .then((data) => {
        if (data.url) setSignedUrl(data.url);
      })
      .catch(console.error)
      .finally(() => setIsLoadingImage(false));
  }, [payment.id, payment.screenshot_path]);

  const handleReject = () => {
    if (!isRejecting) {
      setIsRejecting(true);
      return;
    }
    onReject(rejectNotes);
  };

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">
        Verification Required
      </h3>
      
      <div className="bg-muted/20 border border-purple-500/20 rounded-xl p-4 space-y-4">
        {/* Payment Proof Image */}
        {payment.screenshot_path && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Payment Proof</p>
            {isLoadingImage ? (
              <div className="flex items-center justify-center aspect-[4/3] rounded-lg border border-slate-200 dark:border-slate-800 bg-muted/30">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : signedUrl ? (
              <div 
                className="relative aspect-[4/3] rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 bg-black/5 cursor-pointer group"
                onClick={() => setIsFullScreen(true)}
              >
                <img 
                  src={signedUrl} 
                  alt="Payment proof" 
                  className="w-full h-full object-cover transition-transform group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Maximize2 className="h-6 w-6 text-white drop-shadow-md" />
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center aspect-[4/3] rounded-lg border border-slate-200 dark:border-slate-800 bg-muted/30 text-sm text-muted-foreground">
                Could not load image
              </div>
            )}
          </div>
        )}

        {/* UTR Number */}
        {payment.utr_number && (
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">UTR / Transaction ID</p>
            <p className="font-mono text-sm">{payment.utr_number}</p>
          </div>
        )}

        {/* Rejection notes input */}
        {isRejecting && (
          <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <p className="text-sm font-medium text-red-500">Reason for rejection (optional)</p>
            <Textarea 
              placeholder="E.g., Screenshot is blurry, UTR is missing..."
              value={rejectNotes}
              onChange={(e) => setRejectNotes(e.target.value)}
              className="resize-none h-20"
            />
            <div className="flex gap-2 justify-end pt-1">
              <Button size="sm" variant="ghost" onClick={() => setIsRejecting(false)}>
                Cancel
              </Button>
              <Button size="sm" variant="destructive" onClick={handleReject}>
                Confirm Reject
              </Button>
            </div>
          </div>
        )}

        {/* Action buttons */}
        {!isRejecting && (
          <div className="flex gap-3 pt-2">
            <Button 
              size="sm" 
              variant="outline" 
              className="flex-1 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 border-red-200 dark:border-red-900/50"
              onClick={handleReject}
            >
              <X className="h-4 w-4 mr-2" />
              Reject
            </Button>
            <Button 
              size="sm" 
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={onApprove}
            >
              <Check className="h-4 w-4 mr-2" />
              Approve
            </Button>
          </div>
        )}
      </div>

      {/* Fullscreen Image Modal */}
      {isFullScreen && signedUrl && (
        <div 
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm cursor-zoom-out"
          onClick={() => setIsFullScreen(false)}
        >
          <div className="relative max-w-4xl w-full max-h-[90vh] flex items-center justify-center">
            <img 
              src={signedUrl} 
              alt="Payment proof fullscreen" 
              className="max-w-full max-h-[90vh] object-contain rounded-md"
            />
            <div className="absolute top-4 right-4 flex gap-2">
              <Button 
                variant="secondary" 
                size="icon" 
                className="rounded-full bg-white/20 hover:bg-white/40 text-white"
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(signedUrl, "_blank");
                }}
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
              <Button 
                variant="secondary" 
                size="icon" 
                className="rounded-full bg-white/20 hover:bg-white/40 text-white"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsFullScreen(false);
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
