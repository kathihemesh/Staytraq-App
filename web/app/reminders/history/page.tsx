"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import Link from "next/link"
import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ArrowLeft,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  MessageSquare,
  AlertTriangle,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useReminderHistory, HistoryDateFilter, HistoryStatusFilter, ReminderHistoryItem } from "@/lib/hooks/useReminderHistory"
import { format } from "date-fns"

export default function RemindersHistoryPage() {
  const [dateFilter, setDateFilter] = useState<HistoryDateFilter>("all")
  const [statusFilter, setStatusFilter] = useState<HistoryStatusFilter>("all")
  const [searchTerm, setSearchTerm] = useState("")
  const [page, setPage] = useState(1)
  const [selectedReminder, setSelectedReminder] = useState<ReminderHistoryItem | null>(null)
  const pageSize = 20

  const { history, totalCount, isLoading, error, refresh } = useReminderHistory(
    dateFilter,
    statusFilter,
    searchTerm,
    page,
    pageSize
  )

  const totalPages = Math.ceil(totalCount / pageSize)

  return (
    <DashboardLayout title="Reminders History">
      <div className="min-h-[calc(100vh-100px)] flex flex-col p-2 lg:p-4 gap-6 max-w-5xl mx-auto">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="icon" className="shrink-0 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800">
              <Link href="/reminders">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Reminders History</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">View past reminders sent to tenants.</p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search message content..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value)
                setPage(1)
              }}
              className="pl-9 rounded-xl bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700"
            />
          </div>
          <div className="flex gap-3">
            <Select 
              value={statusFilter} 
              onValueChange={(val: HistoryStatusFilter) => {
                setStatusFilter(val)
                setPage(1)
              }}
            >
              <SelectTrigger className="w-[140px] rounded-xl bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>

            <Select 
              value={dateFilter} 
              onValueChange={(val: HistoryDateFilter) => {
                setDateFilter(val)
                setPage(1)
              }}
            >
              <SelectTrigger className="w-[140px] rounded-xl bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700">
                <SelectValue placeholder="Date" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="all">All Time</SelectItem>
                <SelectItem value="7days">Last 7 Days</SelectItem>
                <SelectItem value="30days">Last 30 Days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* List Content */}
        <div className="flex-1 bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-24 rounded-2xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
              ))}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center p-12 text-center my-auto">
              <AlertTriangle className="h-10 w-10 text-red-500 mb-3" />
              <p className="font-semibold text-slate-900 dark:text-white">Failed to load history</p>
              <p className="text-sm text-slate-500 mt-1">{error}</p>
              <Button variant="outline" className="mt-4" onClick={refresh}>Retry</Button>
            </div>
          ) : history.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center my-auto">
              <div className="h-16 w-16 bg-slate-50 dark:bg-slate-800/50 rounded-full flex items-center justify-center mb-4">
                <MessageSquare className="h-8 w-8 text-slate-400" />
              </div>
              <h3 className="font-semibold text-slate-900 dark:text-white text-lg">No reminders found</h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm max-w-sm mt-1">
                Try adjusting your filters or search term to see more results.
              </p>
              {(statusFilter !== "all" || dateFilter !== "all" || searchTerm) && (
                <Button 
                  variant="link" 
                  onClick={() => {
                    setStatusFilter("all")
                    setDateFilter("all")
                    setSearchTerm("")
                    setPage(1)
                  }}
                  className="mt-2 text-indigo-600"
                >
                  Clear all filters
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                <AnimatePresence initial={false}>
                  {history.map((item) => (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className={cn(
                        "p-4 rounded-2xl border transition-all relative overflow-hidden group cursor-pointer md:cursor-default",
                        item.status === 'sent' 
                          ? "bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 hover:border-emerald-200 dark:hover:border-emerald-500/30 hover:shadow-sm hover:shadow-emerald-500/5"
                          : "bg-red-50/50 dark:bg-red-500/5 border-red-100 dark:border-red-500/10 hover:border-red-200 dark:hover:border-red-500/20"
                      )}
                      onClick={() => {
                        if (window.innerWidth < 768) {
                          setSelectedReminder(item)
                        }
                      }}
                    >
                      {/* Left color bar accent */}
                      <div className={cn(
                        "absolute left-0 top-0 bottom-0 w-1",
                        item.status === 'sent' ? "bg-emerald-500" : "bg-red-500"
                      )} />
                      
                      <div className="pl-3 flex flex-col md:flex-row gap-4 justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-slate-900 dark:text-white truncate">
                              {item.tenantName}
                            </span>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium">
                              Room {item.tenantRoom}
                            </span>
                          </div>
                          
                          <p className="text-sm text-slate-600 dark:text-slate-300 line-clamp-1 md:line-clamp-none mt-2 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-100 dark:border-slate-700/50">
                            {item.message}
                          </p>
                        </div>

                        <div className="flex flex-row md:flex-col items-center md:items-end justify-between md:justify-start gap-2 shrink-0">
                          <div className={cn(
                            "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border",
                            item.status === 'sent' 
                              ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20"
                              : "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/20"
                          )}>
                            {item.status === 'sent' ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                            {item.status === 'sent' ? 'Sent' : 'Failed'}
                          </div>
                          
                          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                            <Clock className="h-3.5 w-3.5" />
                            {format(item.sentAt, "MMM d, h:mm a")}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>

              {/* Pagination Footer */}
              {totalPages > 1 && (
                <div className="p-4 border-t border-slate-100 dark:border-slate-800/50 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between shrink-0">
                  <p className="text-sm text-slate-500">
                    Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, totalCount)} of {totalCount}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 rounded-full"
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <div className="text-sm font-medium px-2 text-slate-600 dark:text-slate-300">
                      Page {page} of {totalPages}
                    </div>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 rounded-full"
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Mobile Popup with Framer Motion */}
      <AnimatePresence>
        {selectedReminder && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedReminder(null)}
              className="md:hidden fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className={cn(
                "md:hidden fixed top-[50%] left-[50%] -translate-x-1/2 -translate-y-1/2 z-[101] w-[90vw] max-w-sm rounded-2xl overflow-hidden shadow-2xl border-2",
                selectedReminder.status === 'sent' ? "border-emerald-500 shadow-emerald-500/20" : "border-red-500 shadow-red-500/20"
              )}
            >
              <div className="p-5 bg-white dark:bg-slate-900 flex flex-col gap-4">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-bold text-slate-900 dark:text-white truncate text-lg">
                      {selectedReminder.tenantName}
                    </span>
                    <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium shrink-0">
                      Room {selectedReminder.tenantRoom}
                    </span>
                  </div>
                </div>
                
                <div className="text-sm text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-700/50 whitespace-pre-wrap leading-relaxed max-h-[40vh] overflow-y-auto">
                  {selectedReminder.message}
                </div>

                <div className="flex items-center justify-between pt-2">
                  <div className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border",
                    selectedReminder.status === 'sent' 
                      ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20"
                      : "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/20"
                  )}>
                    {selectedReminder.status === 'sent' ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                    {selectedReminder.status === 'sent' ? 'Sent' : 'Failed'}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-medium">
                    <Clock className="h-4 w-4" />
                    {format(selectedReminder.sentAt, "MMM d, h:mm a")}
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </DashboardLayout>
  )
}
