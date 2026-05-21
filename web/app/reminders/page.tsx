"use client"

import { useState, useMemo, useRef, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import Link from "next/link"
import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { useToast } from "@/hooks/use-toast"
import { useReminderTenants, type ReminderTenant } from "@/lib/hooks/useReminderTenants"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import {
  MessageCircle,
  Send,
  Search,
  Clock,
  ChevronDown,
  X,
  Check,
  Plus,
  HelpCircle,
  SmileIcon,
  AlertTriangle,
  AlertOctagon,
  Phone,
  CheckCircle2,
  CalendarDays,
  IndianRupee,
  DoorOpen,
  Loader2,
  XCircle,
  History,
} from "lucide-react"
import { cn } from "@/lib/utils"

type FilterType = "all" | "overdue" | "due_today" | "due_week" | "upcoming" | "paid"
type FloorFilterType = "all" | number
type SortType = "urgency" | "due_date" | "name" | "amount" | "room"
const messageTemplates = {
  friendly: `Hi {name}, this is a friendly reminder that your rent of ₹{amount} for {room} is due on {dueDate}. Please make the payment at your earliest convenience. Thank you!`,
  firm: `Dear {name}, your rent payment of ₹{amount} for {room} is now due. Please clear the payment immediately to avoid any inconvenience. Contact us if you have any questions.`,
  final: `URGENT: {name}, your rent of ₹{amount} for {room} is overdue. Immediate payment is required. Please settle this at once to avoid further action.`,
  custom: "",
}


const statusConfig = {
  overdue: {
    label: "Overdue",
    colors: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
    bgMuted: "bg-red-50/50 dark:bg-red-950/20",
    borderActive: "border-red-500 dark:border-red-500",
  },
  due_today: {
    label: "Due Today",
    colors: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20",
    bgMuted: "bg-orange-50/50 dark:bg-orange-950/20",
    borderActive: "border-orange-500 dark:border-orange-500",
  },
  due_week: {
    label: "This Week",
    colors: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    bgMuted: "bg-amber-50/50 dark:bg-amber-950/20",
    borderActive: "border-amber-500 dark:border-amber-500",
  },
  upcoming: {
    label: "Upcoming",
    colors: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
    bgMuted: "bg-blue-50/50 dark:bg-blue-950/20",
    borderActive: "border-blue-500 dark:border-blue-500",
  },
  paid: {
    label: "Paid",
    colors: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    bgMuted: "bg-emerald-50/50 dark:bg-emerald-950/20",
    borderActive: "border-emerald-500 dark:border-emerald-500",
  },
}

function getRelativeDueDate(dueDate: Date) {
  const now = new Date()
  const daysUntil = Math.floor((dueDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))

  if (daysUntil < 0) return { label: `${Math.abs(daysUntil)} days overdue`, isUrgent: true }
  if (daysUntil === 0) return { label: "Due today", isUrgent: true }
  if (daysUntil <= 7) return { label: `Due in ${daysUntil} days`, isUrgent: false }
  return { label: `Due in ${daysUntil} days`, isUrgent: false }
}

export default function RemindersPage() {
  const { toast } = useToast()
  const { tenants: allTenants, isLoading, error, refresh } = useReminderTenants()

  const [selectedTenants, setSelectedTenants] = useState<number[]>([])
  const [messageType, setMessageType] = useState<"friendly" | "firm" | "final" | "custom">("friendly")
  const [customMessage, setCustomMessage] = useState("")
  const [filter, setFilter] = useState<FilterType>("all")
  const [floorFilter, setFloorFilter] = useState<FloorFilterType>("all")
  const [sortBy, setSortBy] = useState<SortType>("urgency")
  const [searchTerm, setSearchTerm] = useState("")
  const [isMobileComposerOpen, setIsMobileComposerOpen] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [sendResult, setSendResult] = useState<{
    type: 'success' | 'partial' | 'error';
    title: string;
    message: string;
    failedDetails?: any[];
  } | null>(null)

  const [isMounted, setIsMounted] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  // Auto-dismiss the custom toast after 5 seconds
  useEffect(() => {
    if (sendResult) {
      const timer = setTimeout(() => setSendResult(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [sendResult])

  // Dynamic floor list from live data
  const availableFloors = useMemo(() => {
    return Array.from(new Set(allTenants.map(t => t.floor))).sort()
  }, [allTenants])

  const filteredAndSortedTenants = useMemo(() => {
    let filtered = allTenants.filter((t) => {
      const matchesStatus = filter === "all" || t.status === filter
      const matchesFloor = floorFilter === "all" || t.floor === floorFilter
      const matchesSearch =
        t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.room.toLowerCase().includes(searchTerm.toLowerCase())
      return matchesStatus && matchesFloor && matchesSearch
    })

    const sortOrder: Record<string, number> = { overdue: 0, due_today: 1, due_week: 2, upcoming: 3, paid: 4 }

    filtered.sort((a, b) => {
      if (sortBy === "urgency") return sortOrder[a.status] - sortOrder[b.status]
      if (sortBy === "due_date") return a.dueDate.getTime() - b.dueDate.getTime()
      if (sortBy === "name") return a.name.localeCompare(b.name)
      if (sortBy === "amount") return b.amount - a.amount
      if (sortBy === "room") return a.room.localeCompare(b.room)
      return 0
    })

    return filtered
  }, [filter, floorFilter, sortBy, searchTerm, allTenants])

  const stats = useMemo(() => ({
    overdue: allTenants.filter((t) => t.status === "overdue").length,
    due_week: allTenants.filter((t) => t.status === "due_today" || t.status === "due_week").length,
    paid: allTenants.filter((t) => t.status === "paid").length,
  }), [allTenants])

  const toggleTenant = useCallback((id: number) => {
    setSelectedTenants((prev) => prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id])
  }, [])

  const selectAll = useCallback(() => {
    if (selectedTenants.length === filteredAndSortedTenants.length) {
      setSelectedTenants([])
    } else {
      setSelectedTenants(filteredAndSortedTenants.map((t) => t.id))
    }
  }, [selectedTenants, filteredAndSortedTenants])

  const getMessage = useCallback((tenant: ReminderTenant) => {
    if (!tenant) return ""
    const template = messageType === "custom" ? customMessage : messageTemplates[messageType]
    return template
      .replace("{name}", tenant.name.split(" ")[0])
      .replace("{amount}", tenant.amount.toLocaleString())
      .replace("{room}", tenant.room)
      .replace("{dueDate}", tenant.dueDate.toLocaleDateString("en-IN", { month: "short", day: "numeric" }))
  }, [messageType, customMessage])

  const sendReminders = useCallback(async () => {
    if (selectedTenants.length === 0) return
    setIsSending(true)
    try {
      const selectedTenantsData = allTenants.filter((t) => selectedTenants.includes(t.id))
      const message = getMessage(selectedTenantsData[0])

      const res = await fetch("/api/send-reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantIds: selectedTenants, message, template: messageType }),
      })
      const data = await res.json()

      if (!res.ok) throw new Error(data.error || "Send failed")

      const isSuccess = data.failed === 0;
      const isPartial = data.sent > 0 && data.failed > 0;
      
      setSendResult({
        type: isSuccess ? 'success' : isPartial ? 'partial' : 'error',
        title: isSuccess ? 'Messages Sent Successfully!' : isPartial ? 'Partial Success' : 'Failed to Send',
        message: isSuccess 
          ? `Successfully sent ${data.sent} message${data.sent > 1 ? 's' : ''}.` 
          : isPartial 
            ? `Sent ${data.sent} message${data.sent > 1 ? 's' : ''}, but ${data.failed} failed.` 
            : `Failed to send ${data.failed} messages. Check your Twilio config.`,
        failedDetails: data.failedDetails
      })

      setSelectedTenants([])
    } catch (err: any) {
      setSendResult({
        type: 'error',
        title: 'Error Sending Messages',
        message: err.message || 'An unexpected error occurred.',
      })
    } finally {
      setIsSending(false)
    }
  }, [selectedTenants, allTenants, getMessage, messageType])

  const insertToken = useCallback((token: string) => {
    if (!textareaRef.current) return
    const start = textareaRef.current.selectionStart
    const end = textareaRef.current.selectionEnd
    const text = customMessage
    const newText = text.substring(0, start) + token + text.substring(end)
    setCustomMessage(newText)
    setTimeout(() => {
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(start + token.length, start + token.length)
    }, 0)
  }, [customMessage])

  const selectedTenantsData = allTenants.filter((t) => selectedTenants.includes(t.id))
  const isAnyFilterActive = filter !== "all" || floorFilter !== "all" || searchTerm !== "" || sortBy !== "urgency"

  const composerContent = useMemo(() => (
    <div className="flex flex-col min-h-0 h-full bg-white dark:bg-slate-900 w-full">
      {/* Composer Header */}
      <div className="p-5 border-b border-slate-100 dark:border-slate-800/50 bg-slate-50/50 dark:bg-slate-900/50 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
            <MessageCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h2 className="font-bold text-lg text-slate-900 dark:text-white leading-tight">Composer</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">WhatsApp Reminder</p>
          </div>
        </div>

        {/* Recipients Visual */}
        <div className="bg-white dark:bg-slate-950 rounded-xl p-3 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-slate-500">Recipients ({selectedTenants.length})</p>
            {selectedTenants.length > 0 && (
              <button onClick={() => setSelectedTenants([])} className="text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 uppercase font-bold tracking-wider">
                Clear All
              </button>
            )}
          </div>
          {selectedTenants.length > 0 ? (
            <div className="flex items-center gap-1 overflow-x-auto pb-1 no-scrollbar">
              {selectedTenantsData.map(t => (
                <div key={t.id} className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-full pl-2 pr-1 py-1 text-xs whitespace-nowrap">
                  <span className="font-medium">{t.name.split(' ')[0]}</span>
                  <button onClick={() => toggleTenant(t.id)} className="h-4 w-4 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center text-slate-500">
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400 italic">Select tenants from the list</p>
          )}
        </div>
      </div>

      {/* Scrollable Form */}
      <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar min-h-0">
        
        <div className="space-y-3">
          <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Message Template</Label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { id: "friendly", label: "Friendly", icon: SmileIcon, color: "text-emerald-500" },
              { id: "firm", label: "Firm", icon: AlertTriangle, color: "text-amber-500" },
              { id: "final", label: "Final", icon: AlertOctagon, color: "text-red-500" },
              { id: "custom", label: "Custom", icon: Edit3Icon, color: "text-blue-500" },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setMessageType(t.id as any)}
                className={cn(
                  "flex flex-col items-center justify-center p-3 rounded-2xl border transition-all duration-200",
                  messageType === t.id 
                    ? "bg-slate-900 dark:bg-white border-slate-900 dark:border-white shadow-md text-white dark:text-slate-900" 
                    : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                )}
              >
                <t.icon className={cn("h-5 w-5 mb-1.5", messageType !== t.id && t.color)} />
                <span className="text-xs font-semibold">{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        {messageType === "custom" && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Variables</Label>
            </div>
            <div className="flex flex-wrap gap-2">
              {["{name}", "{amount}", "{room}", "{dueDate}"].map((token) => (
                <button
                  key={token}
                  onClick={() => insertToken(token)}
                  className="px-2.5 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/40 text-xs font-mono font-medium transition-colors flex items-center gap-1"
                >
                  <Plus className="h-3 w-3" /> {token}
                </button>
              ))}
            </div>
            <Textarea
              ref={textareaRef}
              placeholder="Type your message..."
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              className="min-h-[120px] rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 resize-none text-sm focus-visible:ring-emerald-500"
            />
          </motion.div>
        )}

        {/* Chat Bubble Preview */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Preview</Label>
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">WhatsApp</span>
          </div>
          
          <div className="bg-[#EFEAE2] dark:bg-[#0B141A] p-4 rounded-2xl flex flex-col relative overflow-hidden border border-slate-200 dark:border-slate-800">
            {/* Chat background pattern mockup */}
            <div className="absolute inset-0 opacity-10 dark:opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', backgroundSize: '16px 16px' }} />
            
            <motion.div 
              key={messageType + (selectedTenantsData[0]?.id || "none") + customMessage}
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className="relative bg-[#D9FDD3] dark:bg-[#005C4B] rounded-2xl rounded-tr-sm p-3 text-[13px] leading-relaxed text-[#111B21] dark:text-[#E9EDEF] max-w-[85%] self-end shadow-sm"
            >
              {/* Chat Tail SVG */}
              <svg viewBox="0 0 8 13" width="8" height="13" className="absolute top-0 -right-2 text-[#D9FDD3] dark:text-[#005C4B]">
                <path opacity=".13" d="M5.188 1H0v11.193l6.467-8.625C7.526 2.156 6.958 1 5.188 1z" />
                <path fill="currentColor" d="M5.188 0H0v11.193l6.467-8.625C7.526 1.156 6.958 0 5.188 0z" />
              </svg>

              <div className="whitespace-pre-wrap font-sans">
                {selectedTenantsData.length > 0 ? getMessage(selectedTenantsData[0]) : (messageType === "custom" ? (customMessage || "Your custom message will appear here…") : (messageTemplates[messageType] || "Select a template to preview…"))}
              </div>
              
              <div className="flex items-center justify-end gap-1 mt-1 -mb-1 opacity-70">
                <span className="text-[10px]">{new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
                <Check className="h-3 w-3" />
              </div>
            </motion.div>
          </div>
        </div>

      </div>

      {/* Action Footer */}
      <div className="p-5 border-t border-slate-100 dark:border-slate-800/50 bg-white dark:bg-slate-900 mt-auto shrink-0">
        <Button
          size="lg"
          className={cn(
            "w-full rounded-xl shadow-lg transition-all font-semibold",
            selectedTenants.length === 0
              ? "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500 shadow-none hover:bg-slate-100 dark:hover:bg-slate-800"
              : "bg-[#25D366] hover:bg-[#20bd5a] text-white shadow-[#25D366]/20"
          )}
          disabled={selectedTenants.length === 0}
          onClick={() => {
            sendReminders()
            if (setIsMobileComposerOpen) {
              setIsMobileComposerOpen(false)
            }
          }}
        >
          {isSending ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending...</>
          ) : selectedTenants.length === 0 ? "Select tenants" : `Send ${selectedTenants.length} Message${selectedTenants.length > 1 ? 's' : ''}`}
        </Button>
      </div>
    </div>
  ), [
    selectedTenants,
    selectedTenantsData,
    messageType,
    customMessage,
    isSending,
    insertToken,
    getMessage,
    sendReminders,
    setIsMobileComposerOpen
  ])

  if (!isMounted) return null

  if (isLoading) return (
    <DashboardLayout title="Reminders">
      <div className="p-4 lg:p-6 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-20 rounded-2xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
        ))}
      </div>
    </DashboardLayout>
  )

  if (error) return (
    <DashboardLayout title="Reminders">
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <AlertTriangle className="h-10 w-10 text-red-500 mb-3" />
        <p className="font-semibold text-slate-900 dark:text-white">Failed to load tenants</p>
        <p className="text-sm text-slate-500 mt-1">{error}</p>
        <Button variant="outline" className="mt-4" onClick={refresh}>Retry</Button>
      </div>
    </DashboardLayout>
  )

  return (
    <DashboardLayout title="Reminders">
      <div className="min-h-[calc(100vh-100px)] flex flex-col xl:flex-row gap-6 p-2 lg:p-4">
        
        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 space-y-6">
          
          {/* Header & Quick Stats */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Reminders</h1>
                <Button asChild variant="outline" size="icon" className="md:hidden h-8 w-8 rounded-full">
                  <Link href="/reminders/history">
                    <History className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm" className="hidden md:flex bg-white dark:bg-slate-900">
                  <Link href="/reminders/history">
                    <History className="h-4 w-4 mr-2" />
                    History
                  </Link>
                </Button>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Manage and send payment reminders to tenants.</p>
            </div>
            
            <div className="flex flex-wrap gap-2 items-center">
              {[
                { id: "overdue",  label: "Overdue",   count: stats.overdue,  text: "text-red-700 dark:text-red-400",     border: "border-red-300 dark:border-red-500/40",     bg: "bg-red-50 dark:bg-red-500/10" },
                { id: "due_week", label: "This Week", count: stats.due_week, text: "text-amber-700 dark:text-amber-400", border: "border-amber-300 dark:border-amber-500/40", bg: "bg-amber-50 dark:bg-amber-500/10" },
                { id: "paid",     label: "Paid",      count: stats.paid,     text: "text-emerald-700 dark:text-emerald-400", border: "border-emerald-300 dark:border-emerald-500/40", bg: "bg-emerald-50 dark:bg-emerald-500/10" }
              ].map((stat) => (
                <button
                  key={stat.id}
                  onClick={() => setFilter(filter === stat.id ? "all" : stat.id as FilterType)}
                  className={cn(
                    "relative flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-medium transition-all duration-200 cursor-pointer",
                    stat.text,
                    stat.border,
                    filter === stat.id
                      ? stat.bg + " shadow-sm ring-1 ring-current/20 font-semibold"
                      : "bg-white dark:bg-slate-900"
                  )}
                >
                  <span>{stat.label}</span>
                  <span className="px-2 py-0.5 rounded-full text-xs bg-current/10">
                    {stat.count}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Filters Bar */}
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex flex-col lg:flex-row gap-4 items-center">
              <div className="relative flex-1 w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search tenants or rooms..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 bg-slate-50 dark:bg-slate-900 border-none shadow-none focus-visible:ring-1 focus-visible:ring-slate-300 dark:focus-visible:ring-slate-700 h-10 rounded-xl"
                />
              </div>
              
              <div className="grid grid-cols-3 sm:flex sm:flex-nowrap gap-2 w-full lg:w-auto">
                <Select value={filter} onValueChange={(v: FilterType) => setFilter(v)}>
                  <SelectTrigger className="w-full sm:w-[140px] h-10 rounded-xl bg-slate-50 dark:bg-slate-900 border-none shadow-none focus:ring-1 focus:ring-slate-300 dark:focus:ring-slate-700 text-xs sm:text-sm px-2 sm:px-3">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl shadow-xl">
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="overdue">Overdue</SelectItem>
                    <SelectItem value="due_today">Due Today</SelectItem>
                    <SelectItem value="due_week">This Week</SelectItem>
                    <SelectItem value="upcoming">Upcoming</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={floorFilter.toString()} onValueChange={(v) => setFloorFilter(v === "all" ? "all" : parseInt(v))}>
                  <SelectTrigger className="w-full sm:w-[130px] h-10 rounded-xl bg-slate-50 dark:bg-slate-900 border-none shadow-none focus:ring-1 focus:ring-slate-300 dark:focus:ring-slate-700 text-xs sm:text-sm px-2 sm:px-3">
                    <SelectValue placeholder="Floor" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl shadow-xl">
                    <SelectItem value="all">All Floors</SelectItem>
                    {availableFloors.map(floor => (
                      <SelectItem key={floor} value={String(floor)}>
                        {floor === 0 ? "Ground Floor" : `Floor ${floor}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={sortBy} onValueChange={(v: SortType) => setSortBy(v)}>
                  <SelectTrigger className="w-full sm:w-[140px] h-10 rounded-xl bg-slate-50 dark:bg-slate-900 border-none shadow-none focus:ring-1 focus:ring-slate-300 dark:focus:ring-slate-700 text-xs sm:text-sm px-2 sm:px-3">
                    <SelectValue placeholder="Sort By" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl shadow-xl">
                    <SelectItem value="urgency">Urgency</SelectItem>
                    <SelectItem value="due_date">Due Date</SelectItem>
                    <SelectItem value="name">Name</SelectItem>
                    <SelectItem value="amount">Amount</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Mobile Bottom Action Bar (Replaces floating pill) */}
          <div className="xl:hidden">
            <AnimatePresence>
              {selectedTenants.length > 0 && (
                <motion.div
                  key="mobile-actions"
                  initial={{ opacity: 0, y: 100 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 100 }}
                  className="fixed bottom-0 left-0 right-0 z-40 p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 shadow-[0_-10px_40px_rgba(0,0,0,0.1)] rounded-t-3xl flex items-center justify-between"
                >
                  <div className="flex flex-col">
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {selectedTenants.length} selected
                    </span>
                    <button onClick={() => setSelectedTenants([])} className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 text-left font-medium mt-0.5">
                      Deselect all
                    </button>
                  </div>
                  <Button 
                    onClick={() => setIsMobileComposerOpen(true)}
                    className="bg-[#25D366] hover:bg-[#20bd5a] text-white rounded-xl shadow-lg shadow-[#25D366]/20 font-semibold"
                  >
                    <MessageCircle className="mr-2 h-4 w-4" />
                    Compose
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Tenant List */}
          <div className="flex flex-col">
            <div className="flex items-center px-2 sm:px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              <div className="w-[40px] shrink-0">
                <Checkbox
                  checked={selectedTenants.length === filteredAndSortedTenants.length && filteredAndSortedTenants.length > 0}
                  onCheckedChange={selectAll}
                  className="rounded-md data-[state=checked]:bg-slate-900 dark:data-[state=checked]:bg-white data-[state=checked]:text-white dark:data-[state=checked]:text-slate-900"
                />
              </div>
              <div className="flex-1 min-w-0 pr-2">Tenant</div>
              <div className="w-[100px] text-right hidden sm:block">Amount</div>
              <div className="w-[120px] md:w-[180px] text-right">Status</div>
            </div>

            <div className="relative pb-20">
              <AnimatePresence initial={false}>
                {filteredAndSortedTenants.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="flex flex-col items-center justify-center py-20 px-4 text-center bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 border-dashed rounded-3xl"
                  >
                    <div className="h-16 w-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
                      {isAnyFilterActive ? (
                        <Search className="h-8 w-8 text-slate-400" />
                      ) : (
                        <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                      )}
                    </div>
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">
                      {isAnyFilterActive ? "No tenants found" : "All clear!"}
                    </h3>
                    <p className="text-slate-500 dark:text-slate-400 max-w-sm">
                      {isAnyFilterActive
                        ? "We couldn't find any tenants matching your current filters. Try adjusting your search criteria."
                        : "No rent reminders needed right now. Upcoming payments will appear here within 10 days of their due date."}
                    </p>
                    {isAnyFilterActive && (
                      <Button
                        variant="outline"
                        className="mt-6 rounded-xl"
                        onClick={() => {
                          setSearchTerm("")
                          setFilter("all")
                          setFloorFilter("all")
                          setSortBy("urgency")
                        }}
                      >
                        Clear all filters
                      </Button>
                    )}
                  </motion.div>
                ) : (
                  filteredAndSortedTenants.map((tenant) => {
                    const isSelected = selectedTenants.includes(tenant.id)
                    const { label: dueLabel, isUrgent } = getRelativeDueDate(tenant.dueDate)
                    const conf = statusConfig[tenant.status]

                    return (
                      <motion.div
                        initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                        animate={{ opacity: 1, height: "auto", marginBottom: 12 }}
                        exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                        transition={{ duration: 0.25, ease: "easeInOut" }}
                        key={tenant.id}
                        className="overflow-hidden"
                      >
                        <div
                          onClick={() => toggleTenant(tenant.id)}
                          className={cn(
                            "group flex items-center px-2 sm:px-4 py-4 rounded-2xl border transition-all duration-300 cursor-pointer shadow-sm hover:shadow-md",
                            isSelected 
                              ? `${conf.borderActive} ${conf.bgMuted} ring-1 ring-${conf.borderActive.split('-')[1]}-500/50` 
                              : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700",
                            tenant.status === "paid" && "opacity-75"
                          )}
                        >
                        <div className="w-[40px] shrink-0" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleTenant(tenant.id)}
                            disabled={tenant.status === "paid"}
                            className="rounded-md data-[state=checked]:bg-slate-900 dark:data-[state=checked]:bg-white data-[state=checked]:text-white dark:data-[state=checked]:text-slate-900"
                          />
                        </div>

                        <div className="flex-1 min-w-0 flex items-center gap-2 sm:gap-4 pr-2">
                          <div className={cn(
                            "hidden md:flex h-10 w-10 rounded-full items-center justify-center font-bold text-sm",
                            isSelected ? "bg-white/50 dark:bg-black/20" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                          )}>
                            {tenant.name.split(" ").map(n => n[0]).join("")}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2 text-sm sm:text-base truncate">
                              {tenant.name}
                            </p>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] sm:text-xs text-slate-500 mt-1">
                              <span className="flex items-center gap-1"><DoorOpen className="h-3 w-3" /> {tenant.room}</span>
                              <span className="flex sm:hidden items-center gap-1">
                                <IndianRupee className="h-2.5 w-2.5" /> {tenant.amount.toLocaleString()}
                              </span>
                              {tenant.status !== "paid" && (
                                <span className={cn(
                                  "flex md:hidden items-center gap-1",
                                  isUrgent ? "text-red-500 dark:text-red-400" : ""
                                )}>
                                  <CalendarDays className="h-2.5 w-2.5" />
                                  {dueLabel}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="w-[100px] text-right hidden sm:flex flex-col items-end">
                          <p className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1 text-sm">
                            <IndianRupee className="h-3.5 w-3.5" />
                            {tenant.amount.toLocaleString()}
                          </p>
                        </div>

                        <div className="w-[120px] md:w-[180px] flex flex-col items-end gap-1.5 shrink-0">
                          <span className={cn(
                            "px-2.5 py-1 rounded-full text-xs font-semibold border flex items-center gap-1.5",
                            conf.colors
                          )}>
                            {conf.label}
                          </span>
                          {tenant.status !== "paid" && (
                            <span className={cn(
                              "text-[10px] sm:text-xs font-medium items-center gap-1 hidden md:flex",
                              isUrgent ? "text-red-500 dark:text-red-400" : "text-slate-500"
                            )}>
                              <CalendarDays className="h-3 w-3" />
                              {dueLabel}
                            </span>
                          )}
                        </div>
                      </div>
                      </motion.div>
                    )
                  })
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Mobile Composer Sheet */}
        <Sheet open={isMobileComposerOpen} onOpenChange={setIsMobileComposerOpen}>
          <SheetContent side="bottom" className="h-[90vh] p-0 rounded-t-[2rem] bg-white dark:bg-slate-900 border-none overflow-hidden">
            <SheetTitle className="sr-only">Compose WhatsApp Reminder</SheetTitle>
            <SheetDescription className="sr-only">
              Select a message template and review the preview before sending.
            </SheetDescription>
            {isMobileComposerOpen && composerContent}
          </SheetContent>
        </Sheet>

        {/* PC Composer Panel */}
        <div className="hidden xl:flex xl:flex-col w-[400px] shrink-0">
          <div className="sticky top-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl flex flex-col overflow-hidden" style={{ maxHeight: 'calc(100vh - 120px)', height: 'calc(100vh - 120px)' }}>
            {composerContent}
          </div>
        </div>
      </div>

      {/* Custom Animated Toast */}
      <AnimatePresence>
        {sendResult && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] px-4 w-full max-w-sm pointer-events-none">
            <motion.div
              initial={{ opacity: 0, y: 50, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="bg-white dark:bg-slate-900 shadow-2xl rounded-2xl border border-slate-200 dark:border-slate-800 p-4 pointer-events-auto flex items-start gap-3"
            >
              <div className={cn("mt-0.5 shrink-0", 
                sendResult.type === 'success' ? 'text-emerald-500' :
                sendResult.type === 'partial' ? 'text-amber-500' : 'text-red-500'
              )}>
                {sendResult.type === 'success' ? <CheckCircle2 className="h-5 w-5" /> : 
                 sendResult.type === 'partial' ? <AlertTriangle className="h-5 w-5" /> : 
                 <XCircle className="h-5 w-5" />}
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-0.5">{sendResult.title}</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">{sendResult.message}</p>
              </div>
              <button 
                onClick={() => setSendResult(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 -mr-2 -mt-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </DashboardLayout>
  )
}

// Extra icons used
function Edit3Icon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  )
}
