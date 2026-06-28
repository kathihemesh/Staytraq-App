"use client"

import { useState, useMemo, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Plus,
  Search,
  Users,
  DoorOpen,
  Pencil,
  Layers,
  IndianRupee,
  Bed,
  Wrench,
  CheckCircle2,
  X,
  ChevronRight,
  Info,
  History,
  AlertTriangle,
  Loader2,
  Phone,
  Mail,
  CalendarDays,
  ArrowRight,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"


import { useAuth } from "@/components/auth-provider"
import Link from "next/link"
import { toast } from "sonner"
import { runWithNetworkRetry } from "@/lib/networkRetry"

// --- TYPES ---

interface BedInfo {
  id: string
  label: string
  occupantName: string | null
}

interface TenantPreview {
  id: number
  name: string
  phone: string
  email: string
  roomId: number
  roomNumber: string
  rentAmount: number
  moveInDate: string
  status: string
  extraCharges: number
}

interface MaintenanceDetails {
  issue: string
  expectedCompletionDate: string
  notes: string
}

interface Room {
  id: string
  number: string
  floor: string
  floorNo: number
  type: "AC" | "Non-AC"
  status: "vacant" | "partially occupied" | "full" | "maintenance"
  capacity: number
  rentAmount: number
  maintenanceFee: number
  notes: string
  beds: BedInfo[]
  occupiedBeds: number
  maintenanceDetails?: MaintenanceDetails
}

// --- HELPER FUNCTIONS ---

function floorNoToLabel(floorNo: number): string {
  if (floorNo === 0) return "Ground Floor"
  if (floorNo === 1) return "1st Floor"
  if (floorNo === 2) return "2nd Floor"
  if (floorNo === 3) return "3rd Floor"
  return `${floorNo}th Floor`
}

function roomTypeToUi(dbType: string): "AC" | "Non-AC" {
  return dbType === "ac" ? "AC" : "Non-AC"
}

function roomTypeToDb(uiType: "AC" | "Non-AC"): string {
  return uiType === "AC" ? "ac" : "non-ac"
}

function generateBeds(totalBeds: number, occupiedBeds: number): BedInfo[] {
  return Array.from({ length: totalBeds }, (_, i) => ({
    id: `bed-${String.fromCharCode(65 + i)}`,
    label: `Bed ${String.fromCharCode(65 + i)}`,
    occupantName: i < occupiedBeds ? `Occupied` : null,
  }))
}

function mapDbRowToRoom(row: any): Room {
  const totalBeds = Number(row.total_beds) || 0
  const occupiedBeds = Number(row.occupied_beds) || 0
  
  let computedStatus = row.status || "vacant"
  
  if (computedStatus !== "maintenance") {
    if (occupiedBeds === 0) {
      computedStatus = "vacant"
    } else if (occupiedBeds >= totalBeds) {
      computedStatus = "full"
    } else {
      computedStatus = "partially occupied"
    }
  }

  return {
    id: String(row.id),
    number: row.room_number || "",
    floor: floorNoToLabel(Number(row.floor_no) || 0),
    floorNo: Number(row.floor_no) || 0,
    type: roomTypeToUi(row.room_type || "non-ac"),
    status: computedStatus,
    capacity: totalBeds,
    rentAmount: Number(row.rent_amount) || 0,
    maintenanceFee: Number(row.maintenance) || 0,
    notes: row.notes || "",
    beds: generateBeds(totalBeds, occupiedBeds),
    occupiedBeds: occupiedBeds,
  }
}

// --- COMPONENT ---

export default function RoomsPage() {
  const supabase = createClient()
  const { user } = useAuth()
  const router = useRouter()
  const [rooms, setRooms] = useState<Room[]>([])
  const [tenantsByRoom, setTenantsByRoom] = useState<Record<string, TenantPreview[]>>({})
  const [previewTenant, setPreviewTenant] = useState<TenantPreview | null>(null)
  const [search, setSearch] = useState("")
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)
  const [isAdding, setIsAdding] = useState(false)
  const [pageError, setPageError] = useState<string | null>(null)
  const [pgMissing, setPgMissing] = useState(false)

  // PG context
  const [pgId, setPgId] = useState<number | null>(null)
  // `no_floors` is the highest floor number (0 => only Ground Floor).
  const [noFloors, setNoFloors] = useState<number>(0)

  // Generate available floors from noFloors
  const availableFloors = useMemo(() => {
    return Array.from({ length: noFloors + 1 }, (_, i) => ({
      value: i,
      label: floorNoToLabel(i),
    }))
  }, [noFloors])
  
  // Sidebar Edit Form State
  const [editForm, setEditForm] = useState<Partial<Room>>({})
  
  // Filters State
  const [filters, setFilters] = useState({
    floor: "All Floors",
    type: "All Types",
    status: "All Statuses",
    capacity: "All Capacities"
  })

  const capacityOptions = useMemo(() => {
    const caps = Array.from(
      new Set(rooms.map((r) => r.capacity).filter((c) => Number.isFinite(c) && c > 0))
    ).sort((a, b) => a - b)
    return ["All Capacities", ...caps.map((c) => `${c} Sharing`)]
  }, [rooms])

  // Add Room Form State
  const [addForm, setAddForm] = useState({
    number: "",
    floorNo: 0,
    type: "Non-AC" as "AC" | "Non-AC",
    capacity: 2,
    rentAmount: 12000,
    maintenanceFee: 1000,
    notes: ""
  })

  // Fetch PG details and rooms
  const fetchData = useCallback(async () => {
    if (!user?.id) {
      // Avoid trapping UI in a loading state if auth is transiently unavailable.
      setIsLoading(false)
      setIsRefreshing(false)
      return
    }
    if (!hasLoadedOnce) setIsLoading(true)
    else setIsRefreshing(true)
    setPageError(null)
    setPgMissing(false)
    try {
      // 1. Get pg_details for this owner
      const { data: pgData, error: pgError } = await runWithNetworkRetry(async () => {
        return await supabase
          .from("pg_details")
          .select("id, no_floors")
          .eq("owner_id", user.id)
          .maybeSingle()
      })

      if (pgError) {
        console.error("Error fetching pg_details:", pgError)
        const msg = pgError.message || "Failed to load PG details."
        setPageError(msg)
        toast.error(msg)
        setIsLoading(false)
        setIsRefreshing(false)
        return
      }

      if (!pgData?.id) {
        setPgId(null)
        setRooms([])
        setPgMissing(true)
        setIsLoading(false)
        setIsRefreshing(false)
        return
      }

      setPgId(pgData.id)
      // IMPORTANT: `0` is a valid value (Ground floor only). Don't coerce it to 1.
      const nextNoFloors =
        pgData.no_floors === null || pgData.no_floors === undefined ? 0 : Number(pgData.no_floors)
      setNoFloors(Number.isFinite(nextNoFloors) ? nextNoFloors : 0)

      // 2. Fetch rooms for this pg
      const { data: roomsData, error: roomsError } = await runWithNetworkRetry(async () => {
        return await supabase
          .from("rooms_table")
          .select(
            "id, pg_id, room_number, floor_no, room_type, status, total_beds, occupied_beds, rent_amount, maintenance, notes"
          )
          .eq("pg_id", pgData.id)
          .order("floor_no", { ascending: true })
          .order("room_number", { ascending: true })
      })

      if (roomsError) {
        console.error("Error fetching rooms:", roomsError)
        const msg = roomsError.message || "Failed to load rooms."
        setPageError(msg)
        toast.error(msg)
        setRooms([])
      } else {
        setRooms((roomsData || []).map(mapDbRowToRoom))
      }

      // 3. Fetch active tenants to populate bed names
      const { data: tenantsData, error: tenantsError } = await runWithNetworkRetry(async () =>
        supabase
          .from("tenants_table")
          .select("id, name, mobile_number, email, room_id, join_date, status, extra_charges")
          .eq("owner_id", user.id)
          .neq("status", "move_out")
      )
      if (tenantsError) {
        console.error("Error fetching tenants for bed allocation:", tenantsError)
      }
      const fetchedRooms = (roomsData || []).map(mapDbRowToRoom)
      const byRoom: Record<string, TenantPreview[]> = {}
      for (const t of tenantsData || []) {
        const key = String(t.room_id)
        if (!byRoom[key]) byRoom[key] = []
        const matchedRoom = fetchedRooms.find(r => r.id === key)
        byRoom[key].push({
          id: t.id,
          name: t.name || "Unknown",
          phone: t.mobile_number || "",
          email: t.email || "",
          roomId: t.room_id,
          roomNumber: matchedRoom?.number || "",
          rentAmount: matchedRoom?.rentAmount || 0,
          moveInDate: t.join_date || "",
          status: t.status || "",
          extraCharges: t.extra_charges || 0,
        })
      }
      setTenantsByRoom(byRoom)
    } catch (err) {
      console.error("Error fetching data:", err)
      setPageError("Unexpected error while loading rooms.")
      toast.error("Unexpected error while loading rooms.")
    }
    setIsLoading(false)
    setIsRefreshing(false)
    setHasLoadedOnce(true)
  }, [user?.id, hasLoadedOnce])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Realtime: keep rooms in sync without refetching on navigation/focus.
  useEffect(() => {
    if (!pgId) return

    const channel = supabase
      .channel(`rooms_table_pg_${pgId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "rooms_table",
          filter: `pg_id=eq.${pgId}`,
        },
        (payload) => {
          const eventType = payload.eventType
          if (eventType === "INSERT") {
            const next = mapDbRowToRoom(payload.new)
            setRooms((prev) => {
              if (prev.some((r) => r.id === next.id)) return prev
              const merged = [...prev, next]
              merged.sort((a, b) => a.floorNo - b.floorNo || a.number.localeCompare(b.number))
              return merged
            })
          } else if (eventType === "UPDATE") {
            const next = mapDbRowToRoom(payload.new)
            setRooms((prev) => prev.map((r) => (r.id === next.id ? next : r)))
            setSelectedRoom((prev) => (prev?.id === next.id ? { ...prev, ...next } : prev))
            setEditForm((prev) => ((prev as any)?.id === next.id ? { ...prev, ...next } : prev))
          } else if (eventType === "DELETE") {
            const deletedId = String((payload.old as any)?.id)
            setRooms((prev) => prev.filter((r) => r.id !== deletedId))
            setSelectedRoom((prev) => (prev?.id === deletedId ? null : prev))
            setIsSidebarOpen((open) => {
              if (selectedRoom?.id === deletedId) return false
              return open
            })
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pgId])

  // Filtered rooms
  const filteredRooms = useMemo(() => {
    return rooms.filter((room) => {
      const matchesSearch = room.number.toLowerCase().includes(search.toLowerCase())
      
      const matchesFloor = filters.floor === "All Floors" || room.floor === filters.floor
      const matchesType = filters.type === "All Types" || room.type === filters.type
      const matchesStatus = filters.status === "All Statuses" || room.status === filters.status.toLowerCase()
      const matchesCapacity =
        filters.capacity === "All Capacities"
          ? true
          : (() => {
              const n = Number.parseInt(filters.capacity, 10)
              return Number.isFinite(n) && room.capacity === n
            })()

      return matchesSearch && matchesFloor && matchesType && matchesStatus && matchesCapacity
    })
  }, [rooms, search, filters])

  useEffect(() => {
    // If selected capacity is no longer available (after refetch/edit), reset.
    if (!capacityOptions.includes(filters.capacity)) {
      setFilters((prev) => ({ ...prev, capacity: "All Capacities" }))
    }
  }, [capacityOptions, filters.capacity])

  const stats = useMemo(() => {
    return {
      vacant: rooms.filter(r => r.status === "vacant").length,
      partial: rooms.filter(r => r.status === "partially occupied").length,
      full: rooms.filter(r => r.status === "full").length,
      maintenance: rooms.filter(r => r.status === "maintenance").length
    }
  }, [rooms])

  const handleRoomClick = (room: Room) => {
    setSelectedRoom(room)
    setEditForm(room)
    setIsEditing(false)
    setIsSidebarOpen(true)
  }

  const handleEditClick = () => {
    setIsEditing(true)
  }

  const handleCancelEdit = () => {
    setIsEditing(false)
    setEditForm(selectedRoom || {})
  }

  const handleSaveEdit = async () => {
    if (!selectedRoom) return
    
    try {
      const updatePayload: Record<string, any> = {
        updated_at: new Date().toISOString(),
        // Persist status changes (e.g. maintenance) from the edit UI.
        status: (editForm.status as Room["status"] | undefined) ?? selectedRoom.status,
      }

      // Only send defined fields to avoid unexpected PostgREST behavior.
      if (typeof editForm.number === "string") updatePayload.room_number = editForm.number
      if (typeof editForm.floorNo === "number") updatePayload.floor_no = editForm.floorNo
      if (editForm.type) updatePayload.room_type = roomTypeToDb(editForm.type as "AC" | "Non-AC")
      if (typeof editForm.capacity === "number") updatePayload.total_beds = editForm.capacity
      if (typeof editForm.rentAmount === "number") updatePayload.rent_amount = editForm.rentAmount
      if (typeof editForm.maintenanceFee === "number") updatePayload.maintenance = editForm.maintenanceFee
      if (typeof editForm.notes === "string") updatePayload.notes = editForm.notes

      const { error } = await supabase
        .from("rooms_table")
        .update(updatePayload)
        .eq("id", Number(selectedRoom.id))

      if (error) {
        console.error("Error updating room:", error)
        toast.error(error.message || "Failed to update room.")
        return
      }

      await fetchData()
      toast.success("Room updated.")
      setIsEditing(false)
      setIsSidebarOpen(false)
    } catch (err) {
      console.error("Error saving edit:", err)
      toast.error("Network error while updating room. Please try again.")
    }
  }

  const handleResolveMaintenance = async () => {
    if (!selectedRoom) return
    try {
      const { error } = await supabase
        .from("rooms_table")
        .update({
          status: "vacant",
          updated_at: new Date().toISOString(),
        })
        .eq("id", Number(selectedRoom.id))

      if (error) {
        console.error("Error resolving maintenance:", error)
        toast.error(error.message || "Failed to resolve maintenance.")
        return
      }

      // Update sidebar immediately (avoids stale state while rooms refetches).
      setSelectedRoom((prev) => (prev ? { ...prev, status: "vacant" } : prev))
      setEditForm((prev) => ({ ...prev, status: "vacant" }))

      await fetchData()
      toast.success("Maintenance resolved.")
    } catch (err) {
      console.error("Error:", err)
      toast.error("Network error while resolving maintenance.")
    }
  }

  const getStatusConfig = (status: Room["status"]) => {
    switch (status) {
      case "vacant":
        return {
          label: "Vacant",
          color: "bg-emerald-500 text-white dark:bg-emerald-500 dark:text-white",
          border: "border-emerald-250/60 dark:border-emerald-950/60 hover:border-emerald-400 dark:hover:border-emerald-700",
          badge: "bg-emerald-50/80 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border-emerald-200/50 dark:border-emerald-800/30",
          track: "bg-slate-100 dark:bg-slate-800/60"
        }
      case "partially occupied":
        return {
          label: "Partially Occupied",
          color: "bg-sky-500 text-white dark:bg-sky-500 dark:text-white",
          border: "border-sky-250/60 dark:border-sky-950/60 hover:border-sky-400 dark:hover:border-sky-700",
          badge: "bg-sky-50/80 dark:bg-sky-950/30 text-sky-600 dark:text-sky-400 border-sky-200/50 dark:border-sky-800/30",
          track: "bg-slate-100 dark:bg-slate-800/60"
        }
      case "full":
        return {
          label: "Full",
          color: "bg-rose-500 text-white dark:bg-rose-500 dark:text-white",
          border: "border-rose-250/60 dark:border-rose-950/60 hover:border-rose-400 dark:hover:border-rose-700",
          badge: "bg-rose-50/80 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 border-rose-200/50 dark:border-rose-800/30",
          track: "bg-slate-100 dark:bg-slate-800/60"
        }
      case "maintenance":
        return {
          label: "Maintenance",
          color: "bg-amber-500 text-white dark:bg-amber-500 dark:text-white",
          border: "border-amber-250/60 dark:border-amber-950/60 hover:border-amber-400 dark:hover:border-amber-700",
          badge: "bg-amber-50/80 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 border-amber-200/50 dark:border-amber-800/30",
          track: "bg-slate-100 dark:bg-slate-800/60"
        }
    }
  }

  // Handle Add Room
  const handleAddRoom = async () => {
    if (!pgId) return
    setIsAdding(true)
    try {
      const { error } = await supabase
        .from("rooms_table")
        .insert({
          pg_id: pgId,
          room_number: addForm.number || "000",
          floor_no: addForm.floorNo,
          room_type: roomTypeToDb(addForm.type),
          total_beds: addForm.capacity,
          rent_amount: addForm.rentAmount,
          maintenance: addForm.maintenanceFee,
          notes: addForm.notes || "",
          status: "vacant",
          occupied_beds: 0,
        })

      if (error) {
        console.error("Error adding room:", error)
        const msg = error.message || "Failed to add room."
        toast.error(msg)
        setIsAdding(false)
        return
      }

      // Reset form and refresh
      setIsAddDialogOpen(false)
      setAddForm({
        number: "",
        floorNo: 0,
        type: "Non-AC",
        capacity: 2,
        rentAmount: 12000,
        maintenanceFee: 1000,
        notes: ""
      })
      await fetchData()
      toast.success("Room added.")
    } catch (err) {
      console.error("Error adding room:", err)
      toast.error("Unexpected error while adding room.")
    }
    setIsAdding(false)
  }

  // Handle Add Floor
  const handleAddFloor = async () => {
    if (!pgId) return
    const newNoFloors = noFloors + 1
    try {
      const { error } = await supabase
        .from("pg_details")
        .update({ no_floors: newNoFloors, updated_at: new Date().toISOString() })
        .eq("id", pgId)

      if (error) {
        console.error("Error adding floor:", error)
        return
      }

      setNoFloors(newNoFloors)
      // Auto-select the new floor
      setAddForm(prev => ({ ...prev, floorNo: newNoFloors }))
    } catch (err) {
      console.error("Error adding floor:", err)
    }
  }

  return (
    <DashboardLayout title="Rooms">
      <div className="min-h-[calc(100vh-100px)] flex flex-col gap-6">
        
        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 space-y-6">
          
          {/* Header & Quick Stats */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            {/* In-page title is hidden on mobile (the top header already shows "Rooms"). */}
            <div className="hidden md:block">
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Rooms</h1>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Manage rooms and occupancy.</p>
            </div>
            
            <div className="-mx-4 flex flex-nowrap gap-2 items-center overflow-x-auto px-4 scrollbar-none md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
              {[
                { id: "vacant",             label: "Vacant",      count: stats.vacant,      text: "text-emerald-700 dark:text-emerald-400", border: "border-emerald-300 dark:border-emerald-500/40", bg: "bg-emerald-50 dark:bg-emerald-500/10" },
                { id: "partially occupied", label: "Partially",   count: stats.partial,     text: "text-sky-700 dark:text-sky-400",           border: "border-sky-300 dark:border-sky-500/40",     bg: "bg-sky-50 dark:bg-sky-500/10" },
                { id: "full",               label: "Full",        count: stats.full,        text: "text-rose-700 dark:text-rose-400",         border: "border-rose-300 dark:border-rose-500/40",   bg: "bg-rose-50 dark:bg-rose-500/10" },
                { id: "maintenance",        label: "Maintenance", count: stats.maintenance, text: "text-amber-700 dark:text-amber-400",       border: "border-amber-300 dark:border-amber-500/40", bg: "bg-amber-50 dark:bg-amber-500/10" }
              ].map((stat) => (
                <button
                  key={stat.id}
                  onClick={() => setFilters(prev => ({ ...prev, status: prev.status === stat.id ? "All Statuses" : stat.id }))}
                  className={cn(
                    "relative flex shrink-0 items-center gap-2 whitespace-nowrap px-4 py-2 rounded-full border text-sm font-medium transition-all duration-200 cursor-pointer",
                    stat.text,
                    stat.border,
                    filters.status === stat.id
                      ? stat.bg + " shadow-sm ring-1 ring-current/20 font-semibold"
                      : "bg-white dark:bg-slate-900 hover:" + stat.bg.split(' ')[0].replace('bg-', 'bg-').replace('/10', '/20')
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
                  placeholder="Search by room number..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 bg-slate-50 dark:bg-slate-900 border-none shadow-none focus-visible:ring-1 focus-visible:ring-slate-300 dark:focus-visible:ring-slate-700 h-10 rounded-xl"
                />
              </div>
              
              <div className="grid grid-cols-3 sm:flex sm:flex-nowrap gap-2 w-full lg:w-auto">
                {[
                  { key: "floor", options: ["All Floors", ...availableFloors.map(f => f.label)] },
                  { key: "type", options: ["All Types", "AC", "Non-AC"] },
                  { key: "capacity", options: capacityOptions }
                ].map((f) => (
                  <Select 
                    key={f.key} 
                    onValueChange={(val) => setFilters(prev => ({ ...prev, [f.key]: val }))}
                    value={filters[f.key as keyof typeof filters]}
                  >
                    <SelectTrigger className="w-full sm:w-[140px] h-10 rounded-xl bg-slate-50 dark:bg-slate-900 border-none shadow-none focus:ring-1 focus:ring-slate-300 dark:focus:ring-slate-700 text-xs sm:text-sm px-2 sm:px-3">
                      <SelectValue placeholder={f.key.charAt(0).toUpperCase() + f.key.slice(1)} />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl shadow-xl">
                      {f.options.map((opt) => (
                        <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ))}
              </div>
            </div>
          </div>

          {/* Loading State */}
          {isLoading && !hasLoadedOnce && (
            <div className="p-4 lg:p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-20 rounded-2xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
              ))}
            </div>
          )}

          {!isLoading && isRefreshing && (
            <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Refreshing rooms…
            </div>
          )}

          {!isLoading && pgMissing && (
            <Card className="p-8 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm rounded-2xl">
              <CardHeader className="p-0 pb-3">
                <CardTitle className="text-lg">Complete onboarding to manage rooms</CardTitle>
              </CardHeader>
              <CardContent className="p-0 space-y-4">
                <p className="text-sm text-muted-foreground">
                  We couldn't find your PG details. Please complete onboarding first, then you can add rooms.
                </p>
                <Button asChild className="h-11 px-6 rounded-xl">
                  <Link href="/onboarding">Go to onboarding</Link>
                </Button>
              </CardContent>
            </Card>
          )}

          {!isLoading && !pgMissing && pageError && (
            <Card className="p-6 border-destructive/40 rounded-2xl bg-white dark:bg-slate-900 shadow-sm">
              <CardHeader className="p-0 pb-2">
                <CardTitle className="text-base text-destructive">Couldn't load rooms</CardTitle>
              </CardHeader>
              <CardContent className="p-0 space-y-3">
                <p className="text-sm text-muted-foreground">{pageError}</p>
                <div className="flex gap-2">
                  <Button variant="outline" className="h-10 rounded-xl" onClick={fetchData}>
                    Retry
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Rooms List */}
          {!isLoading && !pgMissing && !pageError && (
            <div className="flex flex-col">
              <div className="flex items-center px-2 sm:px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <div className="flex-1 min-w-0 pr-2">Room</div>
                <div className="w-[100px] text-right hidden sm:block">Rent / Mo</div>
                <div className="w-[120px] md:w-[180px] text-right">Status</div>
              </div>

              <div className="relative pb-20 space-y-3">
                <AnimatePresence initial={false}>
                  {filteredRooms.length === 0 ? (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="flex flex-col items-center justify-center py-20 px-4 text-center bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 border-dashed rounded-3xl"
                    >
                      <div className="h-16 w-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
                        <Search className="h-8 w-8 text-slate-400" />
                      </div>
                      <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">
                        No rooms found
                      </h3>
                      <p className="text-slate-500 dark:text-slate-400 max-w-sm">
                        We couldn't find any rooms matching your current filters. Try adjusting your search criteria.
                      </p>
                      <Button
                        variant="outline"
                        className="mt-6 rounded-xl"
                        onClick={() => {
                          setSearch("")
                          setFilters({
                            floor: "All Floors",
                            type: "All Types",
                            status: "All Statuses",
                            capacity: "All Capacities"
                          })
                        }}
                      >
                        Clear all filters
                      </Button>
                    </motion.div>
                  ) : (
                    filteredRooms.map((room) => {
                      const config = getStatusConfig(room.status)
                      const occupancyCount = room.occupiedBeds
                      const isSelected = selectedRoom?.id === room.id

                      return (
                        <motion.div
                          layout
                          initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                          animate={{ opacity: 1, height: "auto", marginBottom: 12 }}
                          exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                          transition={{ duration: 0.25, ease: "easeInOut" }}
                          key={room.id}
                          className="overflow-hidden"
                        >
                          <div
                            onClick={() => handleRoomClick(room)}
                            className={cn(
                              "group relative overflow-hidden flex items-center px-2 sm:px-4 py-4 rounded-2xl border transition-all duration-300 cursor-pointer shadow-sm hover:shadow-md",
                              isSelected 
                                ? `${config.border.split(" ")[0]} bg-slate-50 dark:bg-slate-800/50 ring-1 ring-primary/20`
                                : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
                            )}
                          >
                            {/* Background Progress Fill */}
                            <div 
                              className={cn(
                                "absolute inset-y-0 left-0 rounded-r-2xl transition-width duration-500 ease-out",
                                room.status === "maintenance"
                                  ? "bg-amber-300/50 dark:bg-amber-700/40 bg-maintenance-stripes"
                                  : room.status === "vacant" ? "bg-emerald-100/60 dark:bg-emerald-900/20"
                                  : room.status === "full" ? "bg-rose-100/60 dark:bg-rose-900/20"
                                  : "bg-sky-100/60 dark:bg-sky-900/20"
                              )}
                              style={{ 
                                width: `${room.capacity > 0 ? Math.max(room.occupiedBeds / room.capacity * 100, room.status === "maintenance" ? 20 : 0) : room.status === "maintenance" ? 20 : 0}%`
                              }}
                            />

                            <div className="relative z-10 flex-1 min-w-0 flex items-center gap-2 sm:gap-4 pr-2">
                              <div className={cn(
                                "hidden md:flex h-10 w-10 rounded-full items-center justify-center font-bold text-sm",
                                isSelected ? "bg-white/50 dark:bg-black/20" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                              )}>
                                <DoorOpen className="h-5 w-5" />
                              </div>
                              <div>
                                <p className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2 text-sm sm:text-base truncate">
                                  Room {room.number}
                                </p>
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] sm:text-xs text-slate-500 mt-1">
                                  <span className="flex items-center gap-1"><Layers className="h-3 w-3" /> {room.floor}</span>
                                  <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {occupancyCount} / {room.capacity}</span>
                                  <span className="flex items-center gap-1 font-medium">{room.type}</span>
                                  <span className="flex sm:hidden items-center gap-1">
                                    <IndianRupee className="h-2.5 w-2.5" /> {(room.rentAmount / 1000).toFixed(1)}k
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="relative z-10 w-[100px] text-right hidden sm:flex flex-col items-end">
                              <p className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1 text-sm">
                                <IndianRupee className="h-3.5 w-3.5" />
                                {room.rentAmount.toLocaleString()}
                              </p>
                            </div>

                            <div className="relative z-10 w-[120px] md:w-[180px] flex flex-col items-end gap-1.5 shrink-0">
                              <span className={cn(
                                "px-2.5 py-1 rounded-full text-[10px] sm:text-xs font-semibold border flex items-center gap-1.5",
                                config.badge
                              )}>
                                {config.label}
                              </span>
                              {room.status === "maintenance" && (
                                <span className={cn(
                                  "text-[10px] sm:text-xs font-medium items-center gap-1 hidden md:flex text-amber-500 dark:text-amber-400"
                                )}>
                                  <Wrench className="h-3 w-3" />
                                  Under repair
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
          )}
        </div>
      </div>

      {/* Room Details Sidebar */}
      <Sheet open={isSidebarOpen} onOpenChange={setIsSidebarOpen}>
        <SheetContent className="sm:max-w-md w-full overflow-hidden p-0 flex flex-col h-full bg-white/95 dark:bg-slate-950/95 backdrop-blur-2xl border-l border-slate-200/80 dark:border-slate-800/80 shadow-2xl z-50">
          {selectedRoom && (
            <>
              <SheetHeader className="p-6 border-b border-slate-100 dark:border-slate-800/50 bg-slate-50/50 dark:bg-slate-900/20 shrink-0 flex flex-row items-center justify-between space-y-0 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
                <div className="relative">
                  <div className="flex items-center gap-3 mb-1">
                    <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-primary/10 border border-primary/20 shadow-inner">
                      <DoorOpen className="h-5 w-5 text-primary" />
                    </div>
                    <SheetTitle className="text-2xl font-black text-slate-800 dark:text-slate-100 tracking-tight">Room {selectedRoom.number}</SheetTitle>
                  </div>
                  <SheetDescription className="text-sm font-semibold tracking-wide text-slate-500 ml-13">{selectedRoom.floor} • {selectedRoom.type}</SheetDescription>
                </div>
                {!isEditing && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    disabled={isEditing}
                    onClick={handleEditClick}
                    className="h-10 px-4 gap-2 rounded-xl border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold transition-all shadow-sm relative z-10"
                  >
                    <Pencil className="h-4 w-4" />
                    Edit
                  </Button>
                )}
              </SheetHeader>

              <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar">
                <div className="p-6 space-y-8">
                  {/* Status & Quick Info */}
                  <section>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-slate-800/60 shadow-sm transition-all hover:shadow-md">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">Current Status</p>
                        <Badge className={cn("font-bold px-3 py-1 text-xs rounded-lg shadow-sm", getStatusConfig(selectedRoom.status).badge)}>
                          {getStatusConfig(selectedRoom.status).label}
                        </Badge>
                      </div>
                      <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-slate-800/60 shadow-sm transition-all hover:shadow-md flex flex-col justify-center">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Rent / Mo</p>
                        <p className="text-xl font-black text-slate-800 dark:text-slate-100 tracking-tight">₹{selectedRoom.rentAmount.toLocaleString()}</p>
                      </div>
                    </div>
                  </section>

                  {/* Editable Room Information */}
                  <section className="space-y-5">
                    <div className="flex items-center gap-2 text-sm font-black border-l-4 border-primary pl-3 text-slate-800 dark:text-slate-200">
                      <Info className="h-4 w-4 text-primary" />
                      ROOM INFORMATION
                    </div>

                    <div className="grid grid-cols-2 gap-x-6 gap-y-4 p-5 bg-white dark:bg-slate-950/30 border border-slate-100 dark:border-slate-800/60 rounded-2xl shadow-sm">
                      {[
                        { label: "Room Number", value: selectedRoom.number, key: "number" as const, type: "text" },
                        { label: "Floor", value: selectedRoom.floor, key: "floorNo" as const, type: "select" },
                        { label: "Room Type", value: selectedRoom.type, key: "type" as const, type: "select", options: ["AC", "Non-AC"] },
                        { label: "Capacity", value: `${selectedRoom.capacity} Beds`, key: "capacity" as const, type: "number" },
                        { label: "Monthly Rent", value: `₹${selectedRoom.rentAmount.toLocaleString()}`, key: "rentAmount" as const, type: "number" },
                        { label: "Maintenance Fee", value: `₹${selectedRoom.maintenanceFee.toLocaleString()}`, key: "maintenanceFee" as const, type: "number" },
                      ].map((field) => (
                        <div key={field.key} className="flex flex-col gap-1 py-1">
                          <Label className="text-[10px] font-extrabold tracking-wider text-slate-400 dark:text-slate-500 uppercase">{field.label}</Label>
                          <div className="w-full">
                            {isEditing ? (
                              field.key === "floorNo" ? (
                                <Select 
                                  defaultValue={String(editForm.floorNo ?? selectedRoom.floorNo)}
                                  onValueChange={(val) => setEditForm(prev => ({ ...prev, floorNo: Number(val), floor: floorNoToLabel(Number(val)) }))}
                                >
                                  <SelectTrigger className="h-9 text-xs bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 rounded-xl transition-all focus:ring-2 focus:ring-primary/20">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent className="rounded-xl border-slate-200 dark:border-slate-800 shadow-xl">
                                    {availableFloors.map(opt => (
                                      <SelectItem key={opt.value} value={String(opt.value)} className="rounded-lg">{opt.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : field.type === "select" ? (
                                <Select 
                                  defaultValue={editForm[field.key] as string}
                                  onValueChange={(val) => setEditForm(prev => ({ ...prev, [field.key]: val }))}
                                >
                                  <SelectTrigger className="h-9 text-xs bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 rounded-xl transition-all focus:ring-2 focus:ring-primary/20">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent className="rounded-xl border-slate-200 dark:border-slate-800 shadow-xl">
                                    {field.options?.map(opt => (
                                      <SelectItem key={opt} value={opt} className="rounded-lg">{opt}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <Input 
                                  className="h-9 text-xs bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 rounded-xl transition-all focus:ring-2 focus:ring-primary/20" 
                                  type={field.type}
                                  value={(editForm[field.key] as any) ?? ""}
                                  onChange={(e) => setEditForm(prev => ({ ...prev, [field.key]: field.type === "number" ? parseInt(e.target.value) : e.target.value }))}
                                  onWheel={(e) => (e.target as HTMLElement).blur()}
                                />
                              )
                            ) : (
                              <p className="text-sm font-extrabold text-slate-800 dark:text-slate-200 tracking-wide">
                                {field.value}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>

                  {/* Bed Allocation */}
                  <section className="space-y-5">
                    <div className="flex items-center gap-2 text-sm font-black border-l-4 border-primary pl-3 text-slate-800 dark:text-slate-200">
                      <Bed className="h-4 w-4 text-primary" />
                      BED ALLOCATION
                    </div>
                    <div className="space-y-3">
                      {Array.from({ length: selectedRoom.capacity }, (_, idx) => {
                        const tenant = (tenantsByRoom[selectedRoom.id] || [])[idx] ?? null
                        const bedLabel = `Bed ${String.fromCharCode(65 + idx)}`
                        return (
                          <motion.div
                            key={idx}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.05 }}
                            className="flex items-center justify-between p-4 border border-slate-100 dark:border-slate-800/60 rounded-2xl bg-white dark:bg-slate-900/50 shadow-sm hover:shadow-md transition-shadow"
                          >
                            <div className="flex items-center gap-4">
                              <div className={cn(
                                "flex h-10 w-10 items-center justify-center rounded-xl border transition-colors",
                                tenant ? "bg-primary/5 border-primary/20 shadow-inner" : "bg-slate-50 dark:bg-slate-800 border-dashed border-slate-200 dark:border-slate-700"
                              )}>
                                <Bed className={cn("h-5 w-5", tenant ? "text-primary" : "text-slate-400 dark:text-slate-500")} />
                              </div>
                              <div>
                                <p className={cn("text-sm font-bold", tenant ? "text-slate-800 dark:text-slate-100" : "text-slate-400 dark:text-slate-500 italic")}>
                                  {tenant ? tenant.name : "Vacant"}
                                </p>
                                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{bedLabel}</p>
                              </div>
                            </div>
                            {tenant && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setPreviewTenant(tenant)}
                                className="h-9 rounded-xl text-xs font-bold text-primary hover:bg-primary/10 transition-colors"
                              >
                                View
                              </Button>
                            )}
                          </motion.div>
                        )
                      })}
                    </div>
                  </section>

                  {/* Maintenance Management */}
                  <section className="space-y-5 pt-4 border-t border-slate-100 dark:border-slate-800/50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm font-black border-l-4 border-orange-500 pl-3 text-slate-800 dark:text-slate-200">
                        <Wrench className="h-4 w-4 text-orange-500" />
                        MAINTENANCE
                      </div>
                      {!isEditing && selectedRoom.status === "maintenance" && (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 h-9 gap-1.5 font-bold rounded-xl"
                          onClick={handleResolveMaintenance}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          Resolve
                        </Button>
                      )}
                    </div>

                    {(isEditing || selectedRoom.status === "maintenance") ? (
                      <div className="space-y-4 p-5 bg-orange-50 dark:bg-orange-950/20 rounded-2xl border border-orange-200 dark:border-orange-900/50 shadow-sm">
                        {isEditing ? (
                          <div className="flex items-center justify-between py-1">
                             <Label htmlFor="mark-maintenance" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                               Mark for Maintenance
                             </Label>
                             <Select 
                                value={editForm.status === "maintenance" ? "true" : "false"}
                                onValueChange={(val) => setEditForm(prev => ({ ...prev, status: val === "true" ? "maintenance" : "vacant" }))}
                             >
                               <SelectTrigger className="w-24 h-9 text-xs rounded-xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                                 <SelectValue />
                               </SelectTrigger>
                               <SelectContent className="rounded-xl border-slate-200 dark:border-slate-800">
                                 <SelectItem value="true" className="rounded-lg">Yes</SelectItem>
                                 <SelectItem value="false" className="rounded-lg">No</SelectItem>
                               </SelectContent>
                             </Select>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-xs font-bold text-orange-600 dark:text-orange-400 uppercase tracking-widest">
                            <AlertTriangle className="h-4 w-4" />
                            ROOM UNDER MAINTENANCE
                          </div>
                        )}
                      </div>
                    ) : (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="w-full text-xs font-bold h-12 border-dashed border-2 hover:bg-orange-50 hover:text-orange-600 hover:border-orange-200 dark:hover:bg-orange-950/20 dark:hover:text-orange-400 dark:hover:border-orange-900/50 transition-colors rounded-2xl"
                        onClick={() => {
                          setIsEditing(true)
                          setEditForm(prev => ({ ...prev, status: "maintenance" }))
                        }}
                      >
                        <Wrench className="h-4 w-4 mr-2" />
                        Move to Maintenance
                      </Button>
                    )}
                  </section>

                  {/* Room Notes */}
                  <section className="space-y-5 pb-6">
                    <div className="flex items-center gap-2 text-sm font-black border-l-4 border-primary pl-3 text-slate-800 dark:text-slate-200">
                      <History className="h-4 w-4 text-primary" />
                      ROOM NOTES
                    </div>
                    {isEditing ? (
                      <Textarea 
                        placeholder="Write special notes or instructions for this room..."
                        className="text-sm min-h-[120px] bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 rounded-2xl resize-none p-4 focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all"
                        value={editForm.notes || ""}
                        onChange={(e) => setEditForm(prev => ({ ...prev, notes: e.target.value }))}
                      />
                    ) : (
                      <div className="p-5 bg-slate-50 dark:bg-slate-900/50 rounded-2xl text-sm italic text-slate-600 dark:text-slate-400 border border-slate-100 dark:border-slate-800/60 shadow-sm min-h-[100px] flex items-center">
                        {selectedRoom.notes || "No notes added for this room yet."}
                      </div>
                    )}
                  </section>
                </div>
              </div>

              {isEditing && (
                <SheetFooter className="p-6 pb-8 sm:pb-6 border-t border-slate-100 dark:border-slate-800/50 bg-slate-50/50 dark:bg-slate-900/20 shrink-0 flex flex-row gap-3 sm:gap-4 z-10">
                  <Button 
                    variant="outline" 
                    className="flex-1 h-12 rounded-xl font-bold border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
                    onClick={handleCancelEdit}
                  >
                    Cancel
                  </Button>
                  <Button 
                    className="flex-1 h-12 rounded-xl font-bold shadow-lg shadow-primary/20 bg-primary hover:shadow-xl hover:shadow-primary/30 transition-all active:scale-[0.98]"
                    onClick={handleSaveEdit}
                  >
                    Save Changes
                  </Button>
                </SheetFooter>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogTrigger asChild>
          <div className={cn("fixed bottom-6 right-6 z-[100] transition-all duration-300", isSidebarOpen ? "opacity-0 pointer-events-none scale-75" : "opacity-100 scale-100")}>
            <Button variant="default" size="icon" className="md:hidden h-14 w-14 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/30 border-none transition-transform hover:scale-105 active:scale-95">
              <Plus className="h-6 w-6" />
            </Button>
            <Button variant="default" size="sm" className="hidden md:flex bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/30 border-none rounded-full h-12 px-6 font-bold text-base transition-transform hover:scale-105 active:scale-95">
              <Plus className="h-5 w-5 mr-2" />
              Add Room
            </Button>
          </div>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[500px] border border-slate-200/80 dark:border-slate-800/80 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl shadow-2xl rounded-t-[24px] sm:rounded-[24px] p-0 overflow-hidden flex flex-col z-[100] top-auto bottom-0 left-0 right-0 translate-x-0 translate-y-0 max-w-full sm:top-1/2 sm:left-1/2 sm:right-auto sm:bottom-auto sm:-translate-x-1/2 sm:-translate-y-1/2 sm:max-w-[500px] max-h-dvh sm:max-h-[90vh]">
          <DialogHeader className="p-3 sm:p-6 pb-2 sm:pb-4 border-b border-slate-100 dark:border-slate-800/50 bg-slate-50/50 dark:bg-slate-950/20">
            <DialogTitle className="text-lg sm:text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <DoorOpen className="h-5 w-5 text-primary" />
              Add New Room
            </DialogTitle>
          </DialogHeader>
          
          <div className="p-3 sm:p-6 overflow-y-auto space-y-3 sm:space-y-4 custom-scrollbar">
            <div className="grid grid-cols-2 gap-3 sm:gap-5">
              <div className="space-y-1.5 sm:space-y-2.5">
                <Label htmlFor="add-roomNumber" className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 ml-1">Room Number</Label>
                <Input 
                  id="add-roomNumber" 
                  placeholder="e.g. 101" 
                  value={addForm.number}
                  onChange={(e) => setAddForm(prev => ({ ...prev, number: e.target.value }))}
                  className="h-10 sm:h-12 bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 focus:border-primary/50 focus:ring-2 focus:ring-primary/20 rounded-xl transition-all text-sm"
                />
              </div>
              <div className="space-y-1.5 sm:space-y-2.5">
                <Label htmlFor="add-floor" className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 ml-1">Floor Number</Label>
                <Select 
                  value={String(addForm.floorNo)}
                  onValueChange={(val) => {
                    if (val === "add_new") {
                      handleAddFloor()
                    } else {
                      setAddForm(prev => ({ ...prev, floorNo: Number(val) }))
                    }
                  }}
                >
                  <SelectTrigger id="add-floor" className="h-10 sm:h-12 bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 focus:border-primary/50 focus:ring-2 focus:ring-primary/20 rounded-xl transition-all text-sm">
                    <SelectValue placeholder="Select floor" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[250px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl">
                    {availableFloors.map((floor) => (
                      <SelectItem key={floor.value} value={String(floor.value)} className="rounded-lg focus:bg-slate-50 dark:focus:bg-slate-800 text-sm">{floor.label}</SelectItem>
                    ))}
                    <div className="h-[1px] bg-slate-100 dark:bg-slate-800 my-1.5 mx-1" />
                    <SelectItem value="add_new" className="text-primary font-bold focus:text-primary focus:bg-primary/5 rounded-lg cursor-pointer text-sm">
                      <div className="flex items-center gap-2">
                        <Plus className="h-3.5 w-3.5" />
                        Add New Floor
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-3 sm:gap-5">
              <div className="space-y-1.5 sm:space-y-2.5">
                <Label htmlFor="add-type" className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 ml-1">Room Type</Label>
                <Select 
                  value={addForm.type}
                  onValueChange={(val) => setAddForm(prev => ({ ...prev, type: val as "AC" | "Non-AC" }))}
                >
                  <SelectTrigger id="add-type" className="h-10 sm:h-12 bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 focus:border-primary/50 focus:ring-2 focus:ring-primary/20 rounded-xl transition-all text-sm">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl">
                    <SelectItem value="AC" className="rounded-lg focus:bg-slate-50 dark:focus:bg-slate-800 text-sm">AC</SelectItem>
                    <SelectItem value="Non-AC" className="rounded-lg focus:bg-slate-50 dark:focus:bg-slate-800 text-sm">Non-AC</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:space-y-2.5">
                <Label htmlFor="add-capacity" className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 ml-1">Capacity</Label>
                <Input 
                  id="add-capacity" 
                  type="number" 
                  placeholder="2" 
                  value={addForm.capacity}
                  onChange={(e) => setAddForm(prev => ({ ...prev, capacity: parseInt(e.target.value) || 0 }))}
                  onWheel={(e) => (e.target as HTMLElement).blur()}
                  className="h-10 sm:h-12 bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 focus:border-primary/50 focus:ring-2 focus:ring-primary/20 rounded-xl transition-all text-sm"
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-3 sm:gap-5">
              <div className="space-y-1.5 sm:space-y-2.5">
                <Label htmlFor="add-rent" className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 ml-1">Rent (₹)</Label>
                <Input 
                  id="add-rent" 
                  type="number" 
                  placeholder="12000" 
                  value={addForm.rentAmount}
                  onChange={(e) => setAddForm(prev => ({ ...prev, rentAmount: parseInt(e.target.value) || 0 }))}
                  onWheel={(e) => (e.target as HTMLElement).blur()}
                  className="h-10 sm:h-12 bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 focus:border-primary/50 focus:ring-2 focus:ring-primary/20 rounded-xl transition-all font-semibold text-slate-800 dark:text-slate-200 text-sm"
                />
              </div>
              <div className="space-y-1.5 sm:space-y-2.5">
                <Label htmlFor="add-maintenance" className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 ml-1">Maint. (₹)</Label>
                <Input 
                  id="add-maintenance" 
                  type="number" 
                  placeholder="1000" 
                  value={addForm.maintenanceFee}
                  onChange={(e) => setAddForm(prev => ({ ...prev, maintenanceFee: parseInt(e.target.value) || 0 }))}
                  onWheel={(e) => (e.target as HTMLElement).blur()}
                  className="h-10 sm:h-12 bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 focus:border-primary/50 focus:ring-2 focus:ring-primary/20 rounded-xl transition-all font-semibold text-slate-800 dark:text-slate-200 text-sm"
                />
              </div>
            </div>
            
            <div className="space-y-1.5 sm:space-y-2.5 pb-2">
              <Label htmlFor="add-notes" className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 ml-1">Room Notes</Label>
              <Textarea 
                id="add-notes" 
                placeholder="Special notes or instructions..." 
                className="min-h-[60px] sm:min-h-[100px] resize-none bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 focus:border-primary/50 focus:ring-2 focus:ring-primary/20 rounded-xl transition-all p-3 sm:p-4 text-sm" 
                value={addForm.notes}
                onChange={(e) => setAddForm(prev => ({ ...prev, notes: e.target.value }))}
              />
            </div>
          </div>
          
          <DialogFooter className="p-3 sm:p-6 border-t border-slate-100 dark:border-slate-800/50 bg-slate-50/50 dark:bg-slate-950/20 gap-2 flex-row">
            <Button 
              variant="outline" 
              onClick={() => setIsAddDialogOpen(false)} 
              className="flex-1 sm:flex-none h-10 sm:h-12 px-4 sm:px-6 rounded-xl border-slate-200 dark:border-slate-800 font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleAddRoom} 
              disabled={isAdding} 
              className="flex-1 sm:flex-none h-10 sm:h-12 px-4 sm:px-8 rounded-xl font-bold bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all active:scale-[0.98]"
            >
              {isAdding ? (
                <>
                  <Loader2 className="mr-2 h-4 sm:h-5 w-4 sm:w-5 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Room"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Tenant Quick-View Dialog */}
      <Dialog open={!!previewTenant} onOpenChange={(open) => !open && setPreviewTenant(null)}>
        <DialogContent className="sm:max-w-sm w-[calc(100%-2rem)] border border-slate-200/80 dark:border-slate-800/80 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl shadow-2xl rounded-2xl p-0 overflow-hidden z-[200]">
          <AnimatePresence>
            {previewTenant && (
              <motion.div
                key="tenant-preview"
                initial={{ opacity: 0, scale: 0.96, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 8 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                {/* Header */}
                <div className="p-6 pb-4 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border-b border-slate-100 dark:border-slate-800/50">
                  <div className="flex items-center gap-4 pr-8">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20 shadow-inner text-primary font-black text-xl">
                      {previewTenant.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-lg font-black text-slate-800 dark:text-slate-100 leading-tight truncate">{previewTenant.name}</p>
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-0.5">Room {previewTenant.roomNumber}</p>
                      <span className={cn(
                        "inline-block mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide",
                        previewTenant.status === "active"
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                          : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                      )}>
                        {previewTenant.status.replace("_", " ")}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Details */}
                <div className="p-6 space-y-3">
                  {[
                    { icon: Phone, label: "Phone", value: previewTenant.phone || "—" },
                    { icon: Mail, label: "Email", value: previewTenant.email || "—" },
                    { icon: CalendarDays, label: "Move-in", value: previewTenant.moveInDate ? new Date(previewTenant.moveInDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—" },
                    { icon: IndianRupee, label: "Monthly Rent", value: previewTenant.rentAmount ? `₹${previewTenant.rentAmount.toLocaleString()}` : "—" },
                  ].map(({ icon: Icon, label, value }) => (
                    <div key={label} className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</p>
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{value}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Footer */}
                <div className="px-6 pb-6 pt-0">
                  <Button
                    className="w-full h-11 rounded-xl font-bold bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                    onClick={() => {
                      setPreviewTenant(null)
                      router.push(`/tenants?tenant=${previewTenant.id}`)
                    }}
                  >
                    View Full Profile
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  )
}
