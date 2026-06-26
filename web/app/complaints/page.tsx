"use client"

// Web complaints page — parity with the mobile Complaint Box screen.
// Features: tenant submission portal (link + copy + share + QR + regenerate),
// status/search filters with live counts, a responsive complaint list, and a
// detail dialog (status, owner response, attached images + fullscreen viewer).
//
// NOTE: `image_paths` is not present in the generated Supabase types, so the
// complaints query is cast and the result is mapped through `as unknown as`.

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { QRCodeCanvas } from "qrcode.react"
import {
  Inbox,
  Copy,
  Share2,
  RefreshCw,
  X,
  ShieldCheck,
  Clock,
  QrCode,
  Download,
  Search,
  Loader2,
  ImageIcon,
} from "lucide-react"
import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { createClient } from "@/lib/supabase/client"
import { useAuth } from "@/components/auth-provider"
import { dashboardToast } from "@/lib/dashboard/toast"
import { cn } from "@/lib/utils"

type ComplaintStatus = "Under Working" | "Resolved" | "Ignored"

interface Complaint {
  id: number
  owner_id: string
  complaint_message: string
  status: ComplaintStatus
  owner_response: string | null
  created_at: string
  updated_at: string
  image_paths?: string[] | null
}

const STATUS_CHIPS = ["all", "Under Working", "Resolved", "Ignored"] as const
const STATUS_OPTIONS: ComplaintStatus[] = ["Under Working", "Resolved", "Ignored"]

/** Strip any HTML tags from a stored/owner-entered string before persisting. */
function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, "").trim()
}

function formatDate(isoString: string): string {
  const d = new Date(isoString)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function statusBadgeClass(status: ComplaintStatus): string {
  switch (status) {
    case "Resolved":
      return "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400"
    case "Ignored":
      return "border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-600/40 dark:bg-slate-700/30 dark:text-slate-300"
    default:
      return "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400"
  }
}

export default function ComplaintsPage() {
  const { user } = useAuth()
  const supabase = useMemo(() => createClient(), [])

  const [loading, setLoading] = useState(true)
  const [complaints, setComplaints] = useState<Complaint[]>([])
  const [complaintToken, setComplaintToken] = useState("")
  const [isRefreshingLink, setIsRefreshingLink] = useState(false)
  const hasLoadedOnce = useRef(false)

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("Under Working")
  const [searchQuery, setSearchQuery] = useState("")

  // QR + regenerate dialogs
  const [qrOpen, setQrOpen] = useState(false)
  const [regenOpen, setRegenOpen] = useState(false)
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null)

  // Detail dialog
  const [detailOpen, setDetailOpen] = useState(false)
  const [selected, setSelected] = useState<Complaint | null>(null)
  const [updatedStatus, setUpdatedStatus] = useState<ComplaintStatus>("Under Working")
  const [ownerResponseText, setOwnerResponseText] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [imageUrls, setImageUrls] = useState<string[]>([])
  const [imagesLoading, setImagesLoading] = useState(false)

  // Fullscreen image viewer
  const [viewerUrl, setViewerUrl] = useState<string | null>(null)

  const fetchData = useCallback(
    async (silent = false) => {
      if (!user?.id) {
        setLoading(false)
        return
      }
      try {
        if (!silent && !hasLoadedOnce.current) setLoading(true)

        const [complaintsResult, ownerResult] = await Promise.all([
          (supabase as any)
            .from("complaints")
            .select(
              "id, owner_id, complaint_message, status, owner_response, created_at, updated_at, image_paths",
            )
            .eq("owner_id", user.id)
            .order("created_at", { ascending: false }),
          supabase.from("pg_owners").select("complaint_token").eq("id", user.id).single(),
        ])

        if (complaintsResult.error) throw complaintsResult.error
        setComplaints((complaintsResult.data || []) as unknown as Complaint[])

        let activeToken = (ownerResult.data as { complaint_token?: string } | null)?.complaint_token
        if (!activeToken) {
          activeToken = Math.random().toString(36).substring(2, 14)
          void (supabase.from("pg_owners") as any)
            .update({ complaint_token: activeToken })
            .eq("id", user.id)
        }
        setComplaintToken(activeToken || "")
        hasLoadedOnce.current = true
      } catch (err) {
        console.error("Error fetching complaints:", err)
        dashboardToast.error("Failed to retrieve complaints.")
      } finally {
        setLoading(false)
      }
    },
    [user?.id, supabase],
  )

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  // Realtime updates
  useEffect(() => {
    if (!user?.id) return
    const channel = supabase
      .channel(`complaints_realtime_${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "complaints", filter: `owner_id=eq.${user.id}` },
        () => {
          void fetchData(true)
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [user?.id, supabase, fetchData])

  const portalUrl = `https://staytraq.vercel.app/complaint-submit/${complaintToken}`

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(portalUrl)
      dashboardToast.success("Link copied", { description: "Complaint Box link copied to clipboard." })
    } catch {
      dashboardToast.error("Couldn't copy link.")
    }
  }, [portalUrl])

  const handleShareLink = useCallback(async () => {
    const shareText = `Submit your PG complaints anonymously here: ${portalUrl}`
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: "Complaint Box", text: shareText, url: portalUrl })
      } catch {
        /* user cancelled share — no-op */
      }
      return
    }
    // Fallback: copy to clipboard.
    try {
      await navigator.clipboard.writeText(portalUrl)
      dashboardToast.info("Sharing not supported", { description: "Link copied to clipboard instead." })
    } catch {
      dashboardToast.error("Couldn't share link.")
    }
  }, [portalUrl])

  const confirmRegenerate = useCallback(async () => {
    setRegenOpen(false)
    if (!user?.id) return
    setIsRefreshingLink(true)
    try {
      const newToken = Math.random().toString(36).substring(2, 14)
      const { error } = await (supabase.from("pg_owners") as any)
        .update({ complaint_token: newToken })
        .eq("id", user.id)
      if (error) throw error
      setComplaintToken(newToken)
      dashboardToast.success("Link regenerated", {
        description: "A new anonymous submission URL has been generated.",
      })
    } catch (err) {
      console.error("Error regenerating complaint link:", err)
      dashboardToast.error("Failed to regenerate submission link.")
    } finally {
      setIsRefreshingLink(false)
    }
  }, [user?.id, supabase])

  const handleDownloadQR = useCallback(() => {
    const canvas = qrCanvasRef.current
    if (!canvas) return
    try {
      const dataUrl = canvas.toDataURL("image/png")
      const link = document.createElement("a")
      link.href = dataUrl
      link.download = `staytraq-complaints-qr-${Date.now()}.png`
      link.click()
      dashboardToast.success("Downloaded", { description: "QR code saved to your device." })
    } catch {
      dashboardToast.error("Failed to download QR code.")
    }
  }, [])

  const openDetail = useCallback(
    (complaint: Complaint) => {
      setSelected(complaint)
      setUpdatedStatus(complaint.status)
      setOwnerResponseText(complaint.owner_response || "")
      setDetailOpen(true)

      // Resolve signed URLs for any attached images from the private bucket.
      setImageUrls([])
      const paths = Array.isArray(complaint.image_paths)
        ? complaint.image_paths.filter(Boolean)
        : []
      if (paths.length > 0) {
        setImagesLoading(true)
        void (async () => {
          try {
            const signed = await Promise.all(
              paths.map(async (p) => {
                const { data } = await supabase.storage
                  .from("complaint_images")
                  .createSignedUrl(p, 3600)
                return data?.signedUrl || null
              }),
            )
            setImageUrls(signed.filter((u): u is string => !!u))
          } catch (e) {
            console.error("Error signing complaint images:", e)
          } finally {
            setImagesLoading(false)
          }
        })()
      }
    },
    [supabase],
  )

  const handleSaveDetails = useCallback(async () => {
    if (!selected) return
    setIsSaving(true)
    try {
      const { error } = await (supabase.from("complaints") as any)
        .update({
          status: updatedStatus,
          owner_response: stripHtml(ownerResponseText) || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", selected.id)
      if (error) throw error
      dashboardToast.success("Complaint updated", { description: "Changes saved successfully." })
      setDetailOpen(false)
      void fetchData(true)
    } catch (err) {
      console.error("Error saving complaint details:", err)
      dashboardToast.error("Failed to save updates.")
    } finally {
      setIsSaving(false)
    }
  }, [selected, updatedStatus, ownerResponseText, supabase, fetchData])

  // Counts per chip
  const counts = useMemo(() => {
    return {
      all: complaints.length,
      "Under Working": complaints.filter((c) => c.status === "Under Working").length,
      Resolved: complaints.filter((c) => c.status === "Resolved").length,
      Ignored: complaints.filter((c) => c.status === "Ignored").length,
    } as Record<string, number>
  }, [complaints])

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase()
    return complaints.filter((c) => {
      const matchesStatus =
        statusFilter === "all" || c.status.toLowerCase() === statusFilter.toLowerCase()
      const matchesSearch =
        c.complaint_message.toLowerCase().includes(q) ||
        (c.owner_response ? c.owner_response.toLowerCase().includes(q) : false)
      return matchesStatus && matchesSearch
    })
  }, [complaints, statusFilter, searchQuery])

  return (
    <DashboardLayout title="Complaints">
      <div className="flex flex-col gap-6">
        {/* Tenant submission portal */}
        <Card>
          <CardContent className="flex flex-col gap-4 pt-6">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <ShieldCheck className="h-4 w-4" />
                </span>
                <h2 className="text-sm font-semibold text-foreground">Tenant Submission Portal</h2>
              </div>
              {isRefreshingLink && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>

            <p className="text-xs text-muted-foreground">
              Share this secure, owner-specific link or QR code with tenants to let them submit
              complaints anonymously.
            </p>

            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground">
                {portalUrl}
              </span>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0"
                onClick={handleCopyLink}
                aria-label="Copy link"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => setQrOpen(true)}>
                <QrCode className="h-4 w-4" />
                Show QR
              </Button>
              <Button className="flex-1 sm:flex-none" onClick={handleShareLink}>
                <Share2 className="h-4 w-4" />
                Share Link
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setRegenOpen(true)}
                aria-label="Regenerate link"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search complaints…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-9"
          />
          {searchQuery.length > 0 && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Status chips */}
        <div className="flex flex-wrap gap-2">
          {STATUS_CHIPS.map((chip) => {
            const active = statusFilter.toLowerCase() === chip.toLowerCase()
            const label = chip === "all" ? "All" : chip === "Under Working" ? "Working" : chip
            return (
              <button
                key={chip}
                type="button"
                onClick={() => setStatusFilter(chip)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                <span>{label}</span>
                <span
                  className={cn(
                    "min-w-[18px] rounded-full px-1.5 py-0.5 text-[10px] tabular-nums",
                    active ? "bg-white/20" : "bg-muted",
                  )}
                >
                  {counts[chip] ?? 0}
                </span>
              </button>
            )
          })}
        </div>

        {/* List */}
        {loading && complaints.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Loading complaints…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full border border-border bg-muted/40">
              <Inbox className="h-6 w-6 text-muted-foreground" />
            </span>
            <p className="text-sm font-semibold text-foreground">
              {searchQuery ? "No search results" : "Empty Inbox"}
            </p>
            <p className="max-w-xs text-xs text-muted-foreground">
              {searchQuery
                ? "No complaints match your query. Try broadening your keywords."
                : "No complaints have been submitted yet. Share the submission link above."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((item) => {
              const hasImages =
                Array.isArray(item.image_paths) && item.image_paths.filter(Boolean).length > 0
              return (
                <button
                  key={`${item.id}-${item.status}`}
                  type="button"
                  onClick={() => openDetail(item)}
                  className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {formatDate(item.created_at)}
                    </span>
                    <Badge variant="outline" className={cn("text-[10px]", statusBadgeClass(item.status))}>
                      {item.status}
                    </Badge>
                  </div>
                  <p className="line-clamp-3 text-sm text-foreground">{item.complaint_message}</p>
                  {item.owner_response ? (
                    <p className="line-clamp-2 rounded-md bg-muted/50 px-2 py-1.5 text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">Response: </span>
                      {item.owner_response}
                    </p>
                  ) : null}
                  {hasImages && (
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <ImageIcon className="h-3 w-3" />
                      {item.image_paths!.filter(Boolean).length} attached
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* QR dialog */}
      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Submission QR code</DialogTitle>
            <DialogDescription>Tenants can scan this to open the complaint portal.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-2">
            <div className="rounded-xl bg-white p-4">
              <QRCodeCanvas
                value={portalUrl}
                size={220}
                marginSize={2}
                ref={qrCanvasRef as React.RefObject<HTMLCanvasElement>}
              />
            </div>
            <Button variant="outline" className="w-full" onClick={handleDownloadQR}>
              <Download className="h-4 w-4" />
              Download QR
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Regenerate confirm dialog */}
      <Dialog open={regenOpen} onOpenChange={setRegenOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Regenerate link?</DialogTitle>
            <DialogDescription>
              The current link and QR code will stop working. Anyone with the old link won&apos;t be
              able to submit complaints.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setRegenOpen(false)}>
              Cancel
            </Button>
            <Button className="w-full sm:w-auto" onClick={confirmRegenerate}>
              Regenerate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] gap-4 overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Complaint details</DialogTitle>
            <DialogDescription>Update the complaint status and respond to the tenant.</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            {selected?.complaint_message ? (
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">Complaint</p>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm text-foreground">
                  {selected.complaint_message}
                </p>
              </div>
            ) : null}

            {/* Attached images */}
            {imagesLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading attachments…
              </div>
            ) : imageUrls.length > 0 ? (
              <div className="min-w-0">
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  Attached photos ({imageUrls.length})
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {imageUrls.map((url) => (
                    <button
                      key={url}
                      type="button"
                      onClick={() => setViewerUrl(url)}
                      className="aspect-square overflow-hidden rounded-lg border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="Complaint attachment" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="min-w-0">
              <label htmlFor="complaint-status" className="text-xs font-medium text-muted-foreground">
                Status
              </label>
              <Select
                value={updatedStatus}
                onValueChange={(v) => setUpdatedStatus(v as ComplaintStatus)}
                disabled={isSaving}
              >
                <SelectTrigger id="complaint-status" className="mt-1 w-full">
                  <SelectValue placeholder="Select a status" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-0">
              <label htmlFor="complaint-owner-response" className="text-xs font-medium text-muted-foreground">
                Owner response
              </label>
              <Textarea
                id="complaint-owner-response"
                className="mt-1 min-h-24 resize-none"
                placeholder="Write a response to the tenant…"
                value={ownerResponseText}
                maxLength={2000}
                onChange={(e) => setOwnerResponseText(e.target.value)}
                disabled={isSaving}
              />
              <p className="mt-1 text-right text-xs tabular-nums text-muted-foreground">
                {ownerResponseText.length}/2000
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => setDetailOpen(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="w-full sm:w-auto"
              onClick={handleSaveDetails}
              disabled={isSaving || selected == null}
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save changes"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Fullscreen image viewer */}
      <Dialog open={viewerUrl != null} onOpenChange={(open) => !open && setViewerUrl(null)}>
        <DialogContent className="max-w-3xl border-none bg-transparent p-0 shadow-none">
          <DialogHeader className="sr-only">
            <DialogTitle>Attachment preview</DialogTitle>
          </DialogHeader>
          {viewerUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={viewerUrl}
              alt="Complaint attachment full view"
              className="max-h-[85dvh] w-full rounded-lg object-contain"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  )
}
