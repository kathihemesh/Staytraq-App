"use client"

import { useState, useEffect, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { DashboardLayout } from "@/components/dashboard/dashboard-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { format } from "date-fns"
import {
  Plus, Search, MoreHorizontal, Pencil, Trash2, Phone, Home,
  Mail, Calendar as CalendarIcon, CreditCard, Clock, FileText, UserMinus, Download,
  Filter, ArrowUpDown, MessageSquare, AlertCircle, Users, Upload, X, Info, Loader2
} from "lucide-react"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { useAuth } from "@/components/auth-provider"
import { useToast } from "@/hooks/use-toast"
import imageCompression from "browser-image-compression"

// --- TYPES & MOCK DATA ---

type TenantStatus = "active" | "pending_move_in" | "notice_period" | "moved_out"
type PaymentStatus = "paid" | "pending" | "late"

interface PaymentHistory {
  id: string
  month: string
  rent: number
  extraCharges: number
  status: PaymentStatus | "submitted"
  paidDate?: string
  screenshot_url?: string
  utr_number?: string
  verification_notes?: string
}

interface IdDocument {
  type: string
  url: string
}

interface Tenant {
  id: number
  name: string
  avatar?: string
  phone: string
  email?: string
  roomNumber: string
  roomId: number
  rentAmount: number
  extraCharges: number
  deposit: number
  dueDate: number
  moveInDate: string
  notes: string
  status: TenantStatus
  paymentHistory?: PaymentHistory[]
  id_documents?: IdDocument[]
}

// --- COMPONENTS ---

function TenantsPageContent() {
  const { user } = useAuth()
  const supabase = createClient()
  const { toast } = useToast()
  const searchParams = useSearchParams()
  const router = useRouter()
  
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [rooms, setRooms] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  
  // Date State for Add Tenant
  const [newDueDayNumber, setNewDueDayNumber] = useState<string>("")
  const [defaultDueDay, setDefaultDueDay] = useState<number>(1)
  const [newMoveInDate, setNewMoveInDate] = useState<Date | undefined>(undefined)
  const [moveOutDate, setMoveOutDate] = useState<Date | undefined>(undefined)
  const [moveInDatePopoverOpen, setMoveInDatePopoverOpen] = useState(false)
  
  // Selection State
  const [selectedTenantIds, setSelectedTenantIds] = useState<Set<number>>(new Set())

  // Modals & Drawers State
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [moveOutTenantId, setMoveOutTenantId] = useState<number | null>(null)
  const [viewTenantId, setViewTenantId] = useState<number | null>(null)
  
  // Sidebar Edit State (like rooms page)
  const [isEditingTenant, setIsEditingTenant] = useState(false)
  const [editTenantForm, setEditTenantForm] = useState<Partial<Tenant>>({})

  // Change Room State
  const [changeRoomTenantId, setChangeRoomTenantId] = useState<number | null>(null)
  const [changeRoomNewRoomId, setChangeRoomNewRoomId] = useState("")
  const [changeRoomFloor, setChangeRoomFloor] = useState("")
  const [isChangingRoom, setIsChangingRoom] = useState(false)

  // Derived Values
  const activeTenant = tenants.find(t => t.id === viewTenantId) || null
  const movingOutTenant = tenants.find(t => t.id === moveOutTenantId) || null
  const changeRoomTenant = tenants.find(t => t.id === changeRoomTenantId) || null

  // Auto-open sidebar from ?tenant=<id> query param
  useEffect(() => {
    const tenantParam = searchParams.get("tenant")
    if (tenantParam && tenants.length > 0) {
      const id = parseInt(tenantParam)
      const found = tenants.find(t => t.id === id)
      if (found) {
        setViewTenantId(id)
        // Clean URL without reload
        const url = new URL(window.location.href)
        url.searchParams.delete("tenant")
        window.history.replaceState({}, "", url.toString())
      }
    }
  }, [searchParams, tenants])

  // Form State for Add Tenant
  const [newTenantName, setNewTenantName] = useState("")
  const [newTenantPhone, setNewTenantPhone] = useState("")
  const [newTenantEmail, setNewTenantEmail] = useState("")
  const [newTenantRoomId, setNewTenantRoomId] = useState("")
  const [newTenantFloor, setNewTenantFloor] = useState("")
  const [newTenantDeposit, setNewTenantDeposit] = useState("")
  const [newTenantExtraCharges, setNewTenantExtraCharges] = useState("")
  const [newTenantNotes, setNewTenantNotes] = useState("")
  const [newTenantIdDocs, setNewTenantIdDocs] = useState<{ type: string, file: File, previewUrl: string }[]>([])
  const [selectedIdType, setSelectedIdType] = useState<string>("")
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null)
  const [previewImageTitle, setPreviewImageTitle] = useState<string>("")
  const [isSaving, setIsSaving] = useState(false)
  const [profileIdType, setProfileIdType] = useState<string>("")
  const [isUploadingProfileId, setIsUploadingProfileId] = useState(false)
  
  const fetchData = async () => {
    if (!user?.id) return
    try {
      setIsLoading(true)

      const { data: pgData } = await supabase.from("pg_details").select("id").eq("owner_id", user.id).single()
      if (!pgData) throw new Error("PG details not found")

      // Fetch settings for default due day
      const { data: settingsData } = await supabase
        .from("settings")
        .select("rent_due_day")
        .eq("owner_id", user.id)
        .single()
      if (settingsData?.rent_due_day) {
        setDefaultDueDay(Number(settingsData.rent_due_day))
      }
      
      const { data: roomsData, error: roomsError } = await supabase
        .from("rooms_table")
        .select("*")
        .eq("pg_id", pgData.id)
        
      if (roomsError) throw roomsError
      setRooms(roomsData || [])
      
      const { data: tenantsData, error: tenantsError } = await supabase
        .from("tenants_table")
        .select(`
          *,
          rooms_table (room_number, rent_amount),
          payments (id, month, year, rent_amount, extra_charges, status, paid_at, screenshot_path, utr_number, verification_notes)
        `)
        .eq("owner_id", user.id)
        
      if (tenantsError) throw tenantsError
      
      const formattedTenants: Tenant[] = (tenantsData || []).map((t: any) => ({
        id: t.id,
        name: t.name || "Unknown",
        phone: t.mobile_number || "",
        email: t.email || "",
        roomNumber: t.rooms_table?.room_number || "Unknown",
        roomId: t.room_id || 0,
        rentAmount: t.rooms_table?.rent_amount || 0,
        extraCharges: t.extra_charges || 0,
        deposit: t.deposit_amount || 0,
        dueDate: t.rent_due_day || 1,
        moveInDate: t.join_date || "",
        notes: t.notes || "",
        status: t.status,
        id_documents: t.id_documents || [],
        paymentHistory: (t.payments || [])
          .sort((a: any, b: any) => {
            if (a.year !== b.year) return (b.year || 0) - (a.year || 0)
            return (b.month || 0) - (a.month || 0)
          })
          .map((p: any) => {
            const monthName = typeof p.month === 'number' || !isNaN(Number(p.month)) 
              ? new Date(2000, Number(p.month) - 1).toLocaleString('en-US', { month: 'long' }) 
              : p.month;
            return {
              id: String(p.id),
              month: `${monthName} ${p.year || ''}`.trim(),
              rent: Number(p.rent_amount) || 0,
              extraCharges: Number(p.extra_charges) || 0,
              status: (p.status || "pending") as PaymentStatus | "submitted",
              paidDate: p.paid_at ? p.paid_at.split('T')[0] : undefined,
              screenshot_url: p.screenshot_path,
              utr_number: p.utr_number,
              verification_notes: p.verification_notes
            };
          })
      }))
      
      setTenants(formattedTenants)
    } catch (error: any) {
      toast({ title: "Error fetching data", description: error.message, variant: "destructive" })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (user?.id) {
      fetchData()
    }
  }, [user?.id])

  const resetAddForm = () => {
    setNewTenantName("")
    setNewTenantPhone("")
    setNewTenantEmail("")
    setNewTenantRoomId("")
    setNewTenantFloor("")
    setNewTenantDeposit("")
    setNewTenantExtraCharges("")
    setNewTenantNotes("")
    setNewTenantIdDocs([])
    setSelectedIdType("")
    setNewDueDayNumber("")
    setNewMoveInDate(undefined)
    setMoveInDatePopoverOpen(false)
  }

  const handleSaveTenant = async () => {
    if (!newTenantName || !newTenantPhone || !newTenantRoomId) {
      toast({ title: "Validation Error", description: "Name, phone, and room are required.", variant: "destructive" })
      return
    }

    try {
      setIsSaving(true)
      const roomId = parseInt(newTenantRoomId)

      // Capacity check — fetch fresh data before insert
      const { data: roomCheck, error: roomCheckErr } = await supabase
        .from("rooms_table")
        .select("total_beds, occupied_beds")
        .eq("id", roomId)
        .single()
      if (roomCheckErr) throw roomCheckErr
      const available = (roomCheck.total_beds || 0) - (roomCheck.occupied_beds || 0)
      if (available <= 0) {
        toast({ title: "Room is Full", description: "This room has no available beds. Please select another room.", variant: "destructive" })
        return
      }

      const { data: pgData } = await supabase.from("pg_details").select("id").eq("owner_id", user?.id).single()
      if (!pgData) throw new Error("Could not find PG Details for user")

      let uploadedDocs = []
      if (newTenantIdDocs.length > 0) {
        for (const doc of newTenantIdDocs) {
          try {
            const compressedFile = await imageCompression(doc.file, {
              maxSizeMB: 0.5,
              maxWidthOrHeight: 1920,
              useWebWorker: true,
            })
            
            const fileExt = doc.file.name.split('.').pop()
            const fileName = `${user?.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`
            
            const { error: uploadError } = await supabase.storage
              .from('staytraq_docs')
              .upload(fileName, compressedFile)
              
            if (uploadError) throw uploadError
              
            uploadedDocs.push({
              type: doc.type,
              url: fileName
            })
          } catch (e: any) {
            console.error("Upload error", e)
            toast({ title: "Upload Failed", description: `Failed to upload ${doc.type}: ${e.message}`, variant: "destructive" })
            setIsSaving(false)
            return
          }
        }
      }

      const dueDateNum = newDueDayNumber ? parseInt(newDueDayNumber) : defaultDueDay

      const insertData = {
        owner_id: user?.id,
        pg_id: pgData.id,
        name: newTenantName,
        mobile_number: newTenantPhone,
        email: newTenantEmail || null,
        room_id: roomId,
        deposit_amount: parseInt(newTenantDeposit) || 0,
        extra_charges: newTenantExtraCharges !== "" ? parseInt(newTenantExtraCharges) : 0,
        rent_due_day: dueDateNum,
        join_date: newMoveInDate ? format(newMoveInDate, "yyyy-MM-dd") : null,
        notes: newTenantNotes || null,
        status: "active" as const,
        id_documents: uploadedDocs
      }

      const { error } = await supabase.from("tenants_table").insert(insertData)
      if (error) throw error

      // Atomically increment occupied_beds
      await supabase
        .from("rooms_table")
        .update({ occupied_beds: (roomCheck.occupied_beds || 0) + 1 })
        .eq("id", roomId)

      toast({ title: "Success", description: "Tenant added successfully." })
      setIsAddDialogOpen(false)
      resetAddForm()
      fetchData()
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" })
    } finally {
      setIsSaving(false)
    }
  }

  const handleProfileIdUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !profileIdType || !activeTenant) return

    try {
      setIsUploadingProfileId(true)
      
      const compressedFile = await imageCompression(file, {
        maxSizeMB: 0.5,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
      })
      
      const fileExt = file.name.split('.').pop()
      const fileName = `${user?.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`
      
      const { error: uploadError } = await supabase.storage
        .from('staytraq_docs')
        .upload(fileName, compressedFile)
        
      if (uploadError) throw uploadError

      const currentDocs = activeTenant.id_documents || []
      const updatedDocs = [...currentDocs, { type: profileIdType, url: fileName }]

      const { error: updateError } = await supabase
        .from("tenants_table")
        .update({ id_documents: updatedDocs })
        .eq("id", activeTenant.id)

      if (updateError) throw updateError

      toast({ title: "Success", description: "ID document added successfully." })
      setProfileIdType("")
      fetchData() 
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" })
    } finally {
      setIsUploadingProfileId(false)
      if (e.target) e.target.value = ""
    }
  }

  const handleRemoveProfileId = async (docUrl: string) => {
    if (!activeTenant) return

    try {
      const updatedDocs = (activeTenant.id_documents || []).filter(d => d.url !== docUrl)

      const { error: updateError } = await supabase
        .from("tenants_table")
        .update({ id_documents: updatedDocs })
        .eq("id", activeTenant.id)

      if (updateError) throw updateError

      // Optionally delete from storage too, but keeping it simple for now to avoid accidental data loss
      // or if same file is used elsewhere (though unlikely here)
      
      toast({ title: "Success", description: "ID document removed." })
      fetchData()
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" })
    }
  }

  const handleUpdateTenant = async () => {
    if (!activeTenant) return
    setIsSaving(true)
    try {
      const updatePayload: Record<string, any> = {
        name: editTenantForm.name,
        mobile_number: editTenantForm.phone,
        email: editTenantForm.email,
        deposit_amount: editTenantForm.deposit,
        extra_charges: editTenantForm.extraCharges,
        rent_due_day: parseInt(editTenantForm.dueDate?.toString() || "1"),
        notes: editTenantForm.notes,
        updated_at: new Date().toISOString()
      }

      const { error } = await supabase
        .from("tenants_table")
        .update(updatePayload)
        .eq("id", activeTenant.id)

      if (error) throw error

      toast({ title: "Success", description: "Tenant profile updated successfully." })
      setIsEditingTenant(false)
      fetchData()
    } catch (error: any) {
      console.error("Update error:", error)
      toast({ title: "Error", description: error.message, variant: "destructive" })
    } finally {
      setIsSaving(false)
    }
  }

  const handleChangeRoom = async () => {
    if (!changeRoomTenant || !changeRoomNewRoomId) {
      toast({ title: "Validation Error", description: "Please select a new room.", variant: "destructive" })
      return
    }
    const newRoomId = parseInt(changeRoomNewRoomId)
    if (newRoomId === changeRoomTenant.roomId) {
      toast({ title: "Same Room", description: "Please select a different room.", variant: "destructive" })
      return
    }
    setIsChangingRoom(true)
    try {
      // Fetch both rooms fresh
      const { data: newRoomData, error: newRoomErr } = await supabase
        .from("rooms_table")
        .select("total_beds, occupied_beds")
        .eq("id", newRoomId)
        .single()
      if (newRoomErr) throw newRoomErr
      const available = (newRoomData.total_beds || 0) - (newRoomData.occupied_beds || 0)
      if (available <= 0) {
        toast({ title: "Room is Full", description: "Selected room has no available beds.", variant: "destructive" })
        setIsChangingRoom(false)
        return
      }

      const { data: oldRoomData } = await supabase
        .from("rooms_table")
        .select("occupied_beds")
        .eq("id", changeRoomTenant.roomId)
        .single()

      // 1. Decrement old room
      await supabase
        .from("rooms_table")
        .update({ occupied_beds: Math.max(0, (oldRoomData?.occupied_beds || 1) - 1) })
        .eq("id", changeRoomTenant.roomId)

      // 2. Increment new room
      await supabase
        .from("rooms_table")
        .update({ occupied_beds: (newRoomData.occupied_beds || 0) + 1 })
        .eq("id", newRoomId)

      // 3. Update tenant's room_id
      const { error: updateErr } = await supabase
        .from("tenants_table")
        .update({ room_id: newRoomId })
        .eq("id", changeRoomTenant.id)
      if (updateErr) throw updateErr

      toast({ title: "Room Changed", description: `${changeRoomTenant.name} moved to new room successfully.` })
      setChangeRoomTenantId(null)
      setChangeRoomNewRoomId("")
      setChangeRoomFloor("")
      fetchData()
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" })
    } finally {
      setIsChangingRoom(false)
    }
  }

  const filteredTenants = tenants.filter(tenant => {
    const matchesSearch = 
      tenant.name.toLowerCase().includes(search.toLowerCase()) ||
      tenant.roomNumber.includes(search) ||
      tenant.phone.includes(search)
    
    const matchesFilter = statusFilter === "all" || tenant.status === statusFilter
    
    return matchesSearch && matchesFilter
  })

  // Handlers
  const toggleSelectAll = () => {
    if (selectedTenantIds.size === filteredTenants.length) {
      setSelectedTenantIds(new Set())
    } else {
      setSelectedTenantIds(new Set(filteredTenants.map(t => t.id)))
    }
  }

  const toggleSelectTenant = (id: number) => {
    const newSet = new Set(selectedTenantIds)
    if (newSet.has(id)) newSet.delete(id)
    else newSet.add(id)
    setSelectedTenantIds(newSet)
  }

  const handleDelete = async (id: number) => {
    try {
      const tenantToDelete = tenants.find(t => t.id === id)
      if (!tenantToDelete) return

      const { error } = await supabase.from("tenants_table").delete().eq("id", id)
      if (error) throw error

      // Decrement room occupied beds
      if (tenantToDelete.roomId) {
        const { data: currentRoom } = await supabase
          .from("rooms_table")
          .select("occupied_beds")
          .eq("id", tenantToDelete.roomId)
          .single()
        
        if (currentRoom) {
          await supabase
            .from("rooms_table")
            .update({ occupied_beds: Math.max(0, (currentRoom.occupied_beds || 0) - 1) })
            .eq("id", tenantToDelete.roomId)
        }
      }

      toast({ title: "Success", description: "Tenant deleted successfully." })
      fetchData()
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" })
    }
  }

  const getStatusBadge = (status: TenantStatus) => {
    const config = {
      active: { label: "Active", className: "border-success/30 bg-success/10 text-success" },
      pending_move_in: { label: "Pending Move-In", className: "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400" },
      notice_period: { label: "Notice Period", className: "border-warning/30 bg-warning/10 text-warning" },
      moved_out: { label: "Moved Out", className: "border-muted-foreground/30 bg-muted/50 text-muted-foreground" },
    }
    const { label, className } = config[status]
    return <Badge variant="outline" className={cn("font-medium", className)}>{label}</Badge>
  }

  const getPaymentStatusBadge = (status: PaymentStatus | "submitted") => {
    const styles = {
      paid: "border-success/30 bg-success/10 text-success",
      pending: "border-warning/30 bg-warning/10 text-warning",
      late: "border-destructive/30 bg-destructive/10 text-destructive",
      submitted: "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400",
    }
    return (
      <Badge variant="outline" className={cn("font-medium text-[10px]", styles[status] || styles.pending)}>
        {status.toUpperCase()}
      </Badge>
    )
  }

  const initials = (name: string) => name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase()

  return (
    <DashboardLayout title="Tenants">
      
      {/* HEADER & CONTROLS */}
      <div className="mb-6 flex flex-col gap-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 flex-col gap-4 sm:flex-row sm:items-center">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="main-tenant-search-field"
                name="q_tenant_query"
                type="search"
                autoComplete="one-time-code"
                placeholder="Search by name, phone, or room..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-muted/50 pl-9 focus:bg-background"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <Filter className="mr-2 h-4 w-4 text-muted-foreground" />
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tenants</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="pending_move_in">Pending Move-In</SelectItem>
                <SelectItem value="notice_period">Notice Period</SelectItem>
                <SelectItem value="moved_out">Moved Out</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Button className="w-full sm:w-auto" onClick={() => setIsAddDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Tenant
            </Button>
          </div>
        </div>

        {/* BULK ACTIONS BAR */}
        {selectedTenantIds.size > 0 && (
          <div className="flex items-center justify-between rounded-lg border bg-muted/50 px-4 py-2 animate-in fade-in slide-in-from-top-2">
            <span className="text-sm font-medium">{selectedTenantIds.size} tenant(s) selected</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm">
                <Mail className="mr-2 h-4 w-4" /> Send Reminder
              </Button>
              <Button variant="outline" size="sm">
                <Download className="mr-2 h-4 w-4" /> Export
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* TENANTS LIST - EMPTY STATE */}
      {filteredTenants.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-24 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted/50">
            <UserMinus className="h-10 w-10 text-muted-foreground/50" />
          </div>
          <h3 className="mt-6 text-lg font-semibold">No tenants found</h3>
          <p className="mt-2 text-sm text-muted-foreground max-w-sm">
            Please adjust your search or filter criteria, or add a new tenant to get started.
          </p>
          <Button className="mt-6" onClick={() => setIsAddDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Add your first tenant
          </Button>
        </div>
      )}

      {/* MOBILE CARDS VIEW */}
      {filteredTenants.length > 0 && (
        <div className="grid gap-4 md:hidden">
          {filteredTenants.map((tenant) => (
            <Card key={tenant.id} className="overflow-hidden cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setViewTenantId(tenant.id)}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <Avatar className="h-10 w-10 border">
                      <AvatarImage src={tenant.avatar} />
                      <AvatarFallback className="bg-primary/10 text-primary font-medium">{initials(tenant.name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold">{tenant.name}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        {getStatusBadge(tenant.status)}
                      </div>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      {tenant.status !== 'moved_out' && (
                        <DropdownMenuItem onClick={() => { setChangeRoomTenantId(tenant.id); setChangeRoomFloor(""); setChangeRoomNewRoomId(""); }}>
                          <Home className="mr-2 h-4 w-4" /> Change Room
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem>
                         <CreditCard className="mr-2 h-4 w-4" /> Record Payment
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                         <Mail className="mr-2 h-4 w-4" /> Send Reminder
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {tenant.status !== 'moved_out' && (
                        <DropdownMenuItem onClick={() => setMoveOutTenantId(tenant.id)}>
                           <ArrowUpDown className="mr-2 h-4 w-4" /> Start Move-Out
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        disabled={tenant.status === "active" || tenant.status === "notice_period"}
                        onClick={() => handleDelete(tenant.id)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" /> Delete Tenant
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Home className="h-4 w-4 shrink-0" />
                    <span className="truncate">Room {tenant.roomNumber}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="h-4 w-4 shrink-0" />
                    <span className="truncate">{tenant.phone}</span>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between rounded-lg bg-muted/40 p-3">
                   <div>
                     <p className="text-xs text-muted-foreground">Monthly Rent</p>
                     <div className="flex flex-col">
                       <p className="font-semibold">₹{tenant.rentAmount.toLocaleString()}</p>
                       {tenant.extraCharges !== 0 && (
                         <p className="text-xs text-muted-foreground">
                           {tenant.extraCharges > 0 ? "+" : ""}₹{tenant.extraCharges.toLocaleString()}
                         </p>
                       )}
                     </div>
                   </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Due Date</p>
                    <p className="font-medium">{tenant.dueDate}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* DESKTOP TABLE VIEW */}
      {filteredTenants.length > 0 && (
        <Card className="hidden md:block">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-12 text-center">
                    <Checkbox
                      checked={filteredTenants.length > 0 && selectedTenantIds.size === filteredTenants.length}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Select all"
                    />
                  </TableHead>
                  <TableHead className="font-semibold">Tenant</TableHead>
                  <TableHead className="font-semibold">Contact</TableHead>
                  <TableHead className="font-semibold">Room</TableHead>
                  <TableHead className="font-semibold">Rent</TableHead>
                  <TableHead className="font-semibold">Deposit</TableHead>
                  <TableHead className="font-semibold">Status</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTenants.map((tenant) => (
                  <TableRow 
                    key={tenant.id} 
                    className={cn(
                      "cursor-pointer transition-colors hover:bg-muted/50",
                      selectedTenantIds.has(tenant.id) && "bg-primary/5 hover:bg-primary/10"
                    )}
                    onClick={() => setViewTenantId(tenant.id)}
                  >
                    <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                       <Checkbox
                        checked={selectedTenantIds.has(tenant.id)}
                        onCheckedChange={() => toggleSelectTenant(tenant.id)}
                        aria-label={`Select ${tenant.name}`}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9 border">
                          <AvatarImage src={tenant.avatar} />
                          <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">{initials(tenant.name)}</AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col">
                          <span className="font-medium">{tenant.name}</span>
                          <span className="text-xs text-muted-foreground">Due: {tenant.dueDate}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm">{tenant.phone}</span>
                        {tenant.email && <span className="text-xs text-muted-foreground">{tenant.email}</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">Room {tenant.roomNumber}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                       <div className="flex flex-col">
                         <span className="font-medium">₹{tenant.rentAmount.toLocaleString()}</span>
                         {tenant.extraCharges !== 0 && (
                           <span className="text-xs text-muted-foreground">
                             {tenant.extraCharges > 0 ? "+" : ""}₹{tenant.extraCharges.toLocaleString()}
                           </span>
                         )}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">₹{tenant.deposit.toLocaleString()}</TableCell>
                    <TableCell>{getStatusBadge(tenant.status)}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          {tenant.status !== 'moved_out' && (
                            <DropdownMenuItem onClick={() => { setChangeRoomTenantId(tenant.id); setChangeRoomFloor(""); setChangeRoomNewRoomId(""); }}>
                              <Home className="mr-2 h-4 w-4" /> Change Room
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem>
                            <CreditCard className="mr-2 h-4 w-4" /> Record Payment
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <Mail className="mr-2 h-4 w-4" /> Send Reminder
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {tenant.status !== 'moved_out' && (
                            <DropdownMenuItem onClick={() => setMoveOutTenantId(tenant.id)}>
                              <ArrowUpDown className="mr-2 h-4 w-4" /> Start Move-Out
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            disabled={tenant.status === "active" || tenant.status === "notice_period"}
                            onClick={() => handleDelete(tenant.id)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" /> Delete Tenant
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* --- MODALS & DRAWERS --- */}

      {/* 1. Tenant Profile Sidebar (with inline edit mode, like Rooms page) */}
      <Sheet open={!!viewTenantId} onOpenChange={(open) => { if (!open) { setViewTenantId(null); setIsEditingTenant(false); } }}>
        <SheetContent className="w-full sm:max-w-xl md:max-w-2xl overflow-y-auto p-0 flex flex-col h-full bg-background">
          {activeTenant && (
            <>
              <SheetHeader className="border-b bg-muted/20 p-6 shrink-0 flex flex-row items-start justify-between space-y-0">
                <div className="flex items-center gap-4">
                  <Avatar className="h-16 w-16 border-2 border-background shadow-sm">
                    <AvatarImage src={activeTenant.avatar} />
                    <AvatarFallback className="text-xl bg-primary text-primary-foreground">{initials(activeTenant.name)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <SheetTitle className="text-2xl">{activeTenant.name}</SheetTitle>
                    <SheetDescription className="mt-1 flex items-center gap-2">
                       <Home className="h-4 w-4" /> Room {activeTenant.roomNumber}
                    </SheetDescription>
                  </div>
                </div>
                 <div className="flex items-center gap-2">
                   {getStatusBadge(activeTenant.status)}
                   {!isEditingTenant && activeTenant.status !== 'moved_out' && (
                     <Button
                       variant="outline"
                       size="sm"
                       onClick={() => { setChangeRoomTenantId(activeTenant.id); setChangeRoomFloor(""); setChangeRoomNewRoomId(""); }}
                       className="h-9 px-3 gap-1.5"
                     >
                       <Home className="h-3.5 w-3.5" />
                       Change Room
                     </Button>
                   )}
                   {!isEditingTenant && (
                     <Button
                       variant="outline"
                       size="sm"
                       onClick={() => { setEditTenantForm(activeTenant); setIsEditingTenant(true); }}
                       className="h-9 px-3 gap-1.5"
                     >
                       <Pencil className="h-3.5 w-3.5" />
                       Edit
                     </Button>
                   )}
                 </div>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto min-h-0">
                <div className="p-6">
                  <Tabs defaultValue="details" className="w-full">
                    <TabsList className="mb-4 grid w-full grid-cols-2">
                      <TabsTrigger value="details">Details & Financials</TabsTrigger>
                      <TabsTrigger value="history">Payment History</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="details" className="space-y-8">
                      {/* Financial Info - Quick Stats (read-only) */}
                      {!isEditingTenant && (
                        <div className="grid grid-cols-2 gap-4">
                          <div className="p-4 bg-muted/30 rounded-xl border border-border/50">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Monthly Rent</p>
                            <p className="text-lg font-bold">₹{activeTenant.rentAmount.toLocaleString()}</p>
                          </div>
                          <div className="p-4 bg-muted/30 rounded-xl border border-border/50">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Due Date</p>
                            <p className="text-lg font-bold">{activeTenant.dueDate}</p>
                          </div>
                        </div>
                      )}

                      {/* Editable Tenant Financial Info */}
                      <section className="space-y-4">
                        <div className="flex items-center gap-2 text-sm font-bold border-l-4 border-primary pl-3">
                          <CreditCard className="h-4 w-4 text-primary" />
                          FINANCIAL DETAILS
                        </div>
                        <div className="grid gap-4">
                          {[
                            { label: "Monthly Rent (₹)", value: activeTenant.rentAmount, key: "rentAmount" as const, type: "number" },
                            { label: "Extra Charges / Deductions (₹)", value: activeTenant.extraCharges, key: "extraCharges" as const, type: "number" },
                            { label: "Security Deposit (₹)", value: activeTenant.deposit, key: "deposit" as const, type: "number" },
                            { label: "Rent Due Date", value: activeTenant.dueDate, key: "dueDate" as const, type: "text" },
                          ].map((field) => (
                            <div key={field.key} className="grid grid-cols-5 items-center gap-4">
                              <Label className="col-span-2 text-xs font-medium text-muted-foreground">{field.label}</Label>
                              <div className="col-span-3">
                                {isEditingTenant ? (
                                  <Input
                                    className="h-9"
                                    type={field.type}
                                    value={editTenantForm[field.key] !== undefined ? String(editTenantForm[field.key]) : ""}
                                    onChange={(e) => setEditTenantForm(prev => ({ ...prev, [field.key]: field.type === "number" ? parseInt(e.target.value) || 0 : e.target.value }))}
                                    onWheel={(e) => (e.target as HTMLElement).blur()}
                                  />
                                ) : (
                                  <p className="text-sm font-semibold">
                                    {field.type === "number" ? `₹${(field.value as number).toLocaleString()}` : field.value}
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>

                      {/* Editable Contact Info */}
                      <section className="space-y-4">
                        <div className="flex items-center gap-2 text-sm font-bold border-l-4 border-primary pl-3">
                          <Phone className="h-4 w-4 text-primary" />
                          CONTACT INFORMATION
                        </div>
                        <div className="grid gap-4">
                          {[
                            { label: "Phone Number", value: activeTenant.phone, key: "phone" as const, type: "text" },
                            { label: "Email", value: activeTenant.email || "—", key: "email" as const, type: "email" },
                          ].map((field) => (
                            <div key={field.key} className="grid grid-cols-5 items-center gap-4">
                              <Label className="col-span-2 text-xs font-medium text-muted-foreground">{field.label}</Label>
                              <div className="col-span-3">
                                {isEditingTenant ? (
                                  <Input
                                    className="h-9"
                                    type={field.type}
                                    value={(editTenantForm[field.key] as any) || ""}
                                    onChange={(e) => setEditTenantForm(prev => ({ ...prev, [field.key]: e.target.value }))}
                                  />
                                ) : (
                                  <p className="text-sm font-semibold">{field.value}</p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>

                      {/* Identity & Agreement (read-only) */}
                      <section className="space-y-4">
                        <div className="flex items-center gap-2 text-sm font-bold border-l-4 border-primary pl-3">
                          <Info className="h-4 w-4 text-primary" />
                          IDENTITY & AGREEMENT
                        </div>
                        <div className="grid gap-4">
                          {[
                            { label: "Move-in Date", value: activeTenant.moveInDate },
                          ].map((field) => (
                            <div key={field.label} className="grid grid-cols-5 items-center gap-4">
                              <Label className="col-span-2 text-xs font-medium text-muted-foreground">{field.label}</Label>
                              <div className="col-span-3">
                                <p className="text-sm font-semibold">{field.value}</p>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* ID Documents view */}
                        <div className="grid gap-3 pt-2">
                          {( (activeTenant.id_documents && activeTenant.id_documents.length > 0) || isEditingTenant ) && (
                            <Label className="text-xs font-medium text-muted-foreground">Uploaded Documents</Label>
                          )}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {activeTenant.id_documents?.map((doc, idx) => (
                              <div key={idx} className="flex flex-col gap-2 p-3 border rounded-xl bg-card relative group">
                                {isEditingTenant && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-destructive text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity shadow-sm z-10"
                                    onClick={() => handleRemoveProfileId(doc.url)}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                )}
                                <div className="flex items-center gap-2 mb-1">
                                  <FileText className="w-4 h-4 text-primary shrink-0" />
                                  <span className="text-sm font-semibold truncate">{doc.type}</span>
                                </div>
                                <div className="flex items-center gap-2 mt-auto">
                                  <Button 
                                    variant="secondary" 
                                    size="sm" 
                                    className="flex-1 text-xs h-8"
                                    onClick={async () => {
                                      const { data, error } = await supabase.storage.from('staytraq_docs').createSignedUrl(doc.url, 60)
                                      if (data?.signedUrl) {
                                        setPreviewImageUrl(data.signedUrl)
                                        setPreviewImageTitle(doc.type)
                                      } else {
                                        toast({ title: "Error", description: "Could not fetch image.", variant: "destructive" })
                                      }
                                    }}
                                  >
                                    View
                                  </Button>
                                  <Button 
                                    variant="outline" 
                                    size="icon" 
                                    className="h-8 w-8 shrink-0"
                                    onClick={async () => {
                                      try {
                                        const { data, error } = await supabase.storage.from('staytraq_docs').download(doc.url)
                                        if (error || !data) throw error
                                        const blobUrl = window.URL.createObjectURL(data)
                                        const link = document.createElement('a')
                                        link.href = blobUrl
                                        link.download = `${activeTenant.name}-${doc.type}.jpg`
                                        document.body.appendChild(link)
                                        link.click()
                                        document.body.removeChild(link)
                                        window.URL.revokeObjectURL(blobUrl)
                                      } catch (err) {
                                        console.error("Failed to download image", err)
                                        toast({ title: "Error", description: "Failed to download image.", variant: "destructive" })
                                      }
                                    }}
                                  >
                                    <Download className="w-4 h-4" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                            
                            {isEditingTenant && (!activeTenant.id_documents || activeTenant.id_documents.length < 2) && (
                               <div className="flex flex-col gap-2 p-3 border border-dashed rounded-xl bg-muted/5 flex-1 min-h-[100px] justify-center">
                                 <Select 
                                   value={profileIdType}
                                   onValueChange={setProfileIdType}
                                 >
                                   <SelectTrigger className="h-8 text-xs">
                                     <SelectValue placeholder="Add New ID..." />
                                   </SelectTrigger>
                                   <SelectContent>
                                     <SelectItem value="Aadhar Card" disabled={activeTenant.id_documents?.some(d => d.type === "Aadhar Card")}>Aadhar Card</SelectItem>
                                     <SelectItem value="PAN Card" disabled={activeTenant.id_documents?.some(d => d.type === "PAN Card")}>PAN Card</SelectItem>
                                     <SelectItem value="Driving License" disabled={activeTenant.id_documents?.some(d => d.type === "Driving License")}>Driving License</SelectItem>
                                   </SelectContent>
                                 </Select>
                                 <Button 
                                   variant="secondary" 
                                   size="sm" 
                                   className="h-8 text-xs w-full"
                                   disabled={!profileIdType || isUploadingProfileId}
                                   onClick={() => document.getElementById('profile-id-upload')?.click()}
                                 >
                                   <Plus className="w-3 h-3 mr-1" />
                                   {isUploadingProfileId ? "Uploading..." : "Upload & Save"}
                                 </Button>
                                 <input 
                                   type="file" 
                                   id="profile-id-upload" 
                                   accept="image/*" 
                                   className="hidden" 
                                   onChange={handleProfileIdUpload}
                                 />
                               </div>
                            )}
                          </div>
                        </div>
                      </section>
                      {/* Notes */}
                      <section className="space-y-4">
                        <div className="flex items-center gap-2 text-sm font-bold border-l-4 border-primary pl-3">
                          <FileText className="h-4 w-4 text-primary" />
                          NOTES
                        </div>
                        {isEditingTenant ? (
                          <Textarea
                            placeholder="Write notes about this tenant..."
                            className="text-sm min-h-[100px] bg-muted/20"
                            value={editTenantForm.notes || ""}
                            onChange={(e) => setEditTenantForm(prev => ({ ...prev, notes: e.target.value }))}
                          />
                        ) : (
                          <div className="p-4 bg-muted/20 rounded-xl text-sm italic text-muted-foreground">
                            {activeTenant.notes || "No notes added for this tenant yet."}
                          </div>
                        )}
                      </section>
                    </TabsContent>

                    <TabsContent value="history">
                      <Card>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Month</TableHead>
                              <TableHead>Amount</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Date Paid</TableHead>
                              <TableHead>Proof</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(activeTenant.paymentHistory || []).length === 0 ? (
                               <TableRow>
                                 <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                                   No payment history available.
                                 </TableCell>
                               </TableRow>
                            ) : (
                              (activeTenant.paymentHistory || []).map(ph => (
                                <TableRow key={ph.id}>
                                  <TableCell className="font-medium">{ph.month}</TableCell>
                                  <TableCell>₹{(ph.rent + ph.extraCharges).toLocaleString()}</TableCell>
                                  <TableCell>{getPaymentStatusBadge(ph.status)}</TableCell>
                                  <TableCell className="text-muted-foreground">{ph.paidDate || "-"}</TableCell>
                                  <TableCell>
                                    {ph.screenshot_url ? (
                                      <Button 
                                        variant="ghost" 
                                        size="sm"
                                        className="h-8 text-xs text-primary"
                                        onClick={async () => {
                                          const { data, error } = await supabase.storage.from('staytraq_docs').createSignedUrl(ph.screenshot_url!, 60)
                                          if (data?.signedUrl) {
                                            setPreviewImageUrl(data.signedUrl)
                                            setPreviewImageTitle(`Payment Proof - ${ph.month}`)
                                          } else {
                                            toast({ title: "Error", description: "Could not fetch image.", variant: "destructive" })
                                          }
                                        }}
                                      >
                                        <FileText className="h-3 w-3 mr-1" /> View
                                      </Button>
                                    ) : (
                                      <span className="text-muted-foreground text-xs">-</span>
                                    )}
                                  </TableCell>
                                </TableRow>
                              ))
                            )}
                          </TableBody>
                        </Table>
                      </Card>
                    </TabsContent>
                  </Tabs>
                </div>
              </div>

              {isEditingTenant && (
                <SheetFooter className="p-6 border-t bg-background shrink-0 flex flex-row sm:justify-start gap-3">
                  <Button
                    className="flex-1 h-11 shadow-lg bg-primary hover:bg-primary/90"
                    disabled={isSaving}
                    onClick={handleUpdateTenant}
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      "Save Changes"
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 h-11"
                    onClick={() => { setIsEditingTenant(false); setEditTenantForm(activeTenant); }}
                  >
                    Cancel
                  </Button>
                </SheetFooter>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* 2. Add Tenant Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={(open) => { if (!open) resetAddForm(); setIsAddDialogOpen(open); }}>
        <DialogContent className="sm:max-w-[700px] !max-h-[85vh] !flex !flex-col !gap-0 p-0" showCloseButton={true}>
          <div className="p-6 pb-3 shrink-0">
            <DialogTitle>Add New Tenant</DialogTitle>
            <DialogDescription className="mt-1.5">
              Complete the tenant profile, room allocation, and financial terms.
            </DialogDescription>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0 px-6">
            <div className="grid gap-8 py-4 pb-6">
              {/* Basic Info */}
              <div className="space-y-4">
                <h4 className="font-medium flex items-center gap-2"><div className="h-6 w-1 bg-primary rounded-full"></div>Basic Information</h4>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="add-name">Tenant Name <span className="text-destructive">*</span></Label>
                    <Input id="add-name" name="tenant-name" autoComplete="name" placeholder="Full legal name" value={newTenantName} onChange={e => setNewTenantName(e.target.value)} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="add-phone">Phone Number <span className="text-destructive">*</span></Label>
                    <Input id="add-phone" name="tenant-phone" autoComplete="tel" placeholder="+91 XXXXX XXXXX" value={newTenantPhone} onChange={e => setNewTenantPhone(e.target.value)} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="add-email">Email (Optional)</Label>
                    <Input id="add-email" name="tenant-email" autoComplete="email" type="email" placeholder="tenant@example.com" value={newTenantEmail} onChange={e => setNewTenantEmail(e.target.value)} />
                  </div>
                </div>
              </div>

              {/* Room Allocation */}
              <div className="space-y-4">
                <h4 className="font-medium flex items-center gap-2"><div className="h-6 w-1 bg-primary rounded-full"></div>Room Allocation</h4>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label>Select Floor</Label>
                    <Select value={newTenantFloor} onValueChange={setNewTenantFloor}>
                      <SelectTrigger><SelectValue placeholder="Select a floor" /></SelectTrigger>
                      <SelectContent>
                        {Array.from(new Set(rooms.map(r => r.floor_no))).sort().map(floor => (
                          <SelectItem key={floor} value={floor.toString()}>{floor === 0 ? 'Ground' : floor} Floor</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>Select Room <span className="text-destructive">*</span></Label>
                    <Select value={newTenantRoomId} onValueChange={setNewTenantRoomId} disabled={!newTenantFloor}>
                      <SelectTrigger><SelectValue placeholder={newTenantFloor ? "Select a room" : "Select floor first"} /></SelectTrigger>
                      <SelectContent>
                        {rooms
                          .filter(r => {
                            const hasAvailableBeds = ((r.total_beds || 0) - (r.occupied_beds || 0)) > 0
                            const matchesFloor = newTenantFloor && r.floor_no.toString() === newTenantFloor
                            return hasAvailableBeds && matchesFloor
                          })
                          .map(room => (
                            <SelectItem key={room.id} value={room.id.toString()}>
                              {room.room_number} ({(room.total_beds || 0) - (room.occupied_beds || 0)} beds available)
                            </SelectItem>
                          ))
                        }
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Financials & Dates */}
              <div className="space-y-4">
                <h4 className="font-medium flex items-center gap-2"><div className="h-6 w-1 bg-primary rounded-full"></div>Financials & Terms</h4>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label>Security Deposit</Label>
                    <Input 
                      type="number" 
                      placeholder="₹" 
                      value={newTenantDeposit} 
                      onChange={e => {
                        const val = e.target.value;
                        setNewTenantDeposit(val === "" ? "" : parseInt(val).toString());
                      }} 
                      onWheel={(e) => (e.target as HTMLElement).blur()}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Extra Charges / Deductions (₹)</Label>
                    <Input 
                      type="number" 
                      placeholder="₹" 
                      value={newTenantExtraCharges} 
                      onChange={e => {
                        const val = e.target.value;
                        setNewTenantExtraCharges(val === "" ? "" : parseInt(val).toString());
                      }} 
                      onWheel={(e) => (e.target as HTMLElement).blur()}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Rent Due Day
                      <span className="ml-1 text-xs text-muted-foreground font-normal">(default: {defaultDueDay}th)</span>
                    </Label>
                    <Select
                      value={newDueDayNumber || String(defaultDueDay)}
                      onValueChange={setNewDueDayNumber}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={`${defaultDueDay}th of every month`} />
                      </SelectTrigger>
                      <SelectContent className="max-h-[200px]">
                        {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                          <SelectItem key={day} value={String(day)}>
                            {day}{day === 1 ? "st" : day === 2 ? "nd" : day === 3 ? "rd" : "th"} of every month
                            {day === defaultDueDay ? " (default)" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>Move-In Date</Label>
                    <Popover open={moveInDatePopoverOpen} onOpenChange={setMoveInDatePopoverOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant={"outline"}
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !newMoveInDate && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {newMoveInDate ? format(newMoveInDate, "PPP") : <span>Pick a date</span>}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={newMoveInDate}
                          onSelect={(d) => { setNewMoveInDate(d); setMoveInDatePopoverOpen(false); }}
                          className="rounded-md border shadow"
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              </div>

              {/* Identity & Notes */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium flex items-center gap-2"><div className="h-6 w-1 bg-primary rounded-full"></div>Identity & Notes</h4>
                </div>
                <div className="grid gap-4">
                  <div className="space-y-3">
                    <Label>Identity Documents (Max 2)</Label>
                    {newTenantIdDocs.map((doc, idx) => (
                      <div key={idx} className="flex items-center gap-2 p-2 border rounded-md">
                        <div className="w-10 h-10 relative bg-muted rounded overflow-hidden shrink-0">
                          <img src={doc.previewUrl} alt={doc.type} className="object-cover w-full h-full" />
                        </div>
                        <div className="flex-1 overflow-hidden">
                          <p className="text-sm font-medium truncate">{doc.type}</p>
                          <p className="text-xs text-muted-foreground truncate">{doc.file.name}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            URL.revokeObjectURL(doc.previewUrl)
                            setNewTenantIdDocs(prev => prev.filter((_, i) => i !== idx))
                          }}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                    
                    {newTenantIdDocs.length < 2 && (
                      <div className="flex flex-col gap-2">
                        <div className="flex gap-2">
                          <Select 
                            value={selectedIdType}
                            onValueChange={setSelectedIdType}
                          >
                            <SelectTrigger className="flex-1">
                              <SelectValue placeholder="Select ID Type..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Aadhar Card" disabled={newTenantIdDocs.some(d => d.type === "Aadhar Card")}>Aadhar Card</SelectItem>
                              <SelectItem value="PAN Card" disabled={newTenantIdDocs.some(d => d.type === "PAN Card")}>PAN Card</SelectItem>
                              <SelectItem value="Driving License" disabled={newTenantIdDocs.some(d => d.type === "Driving License")}>Driving License</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            variant="secondary"
                            disabled={!selectedIdType}
                            onClick={() => {
                              const input = document.getElementById('id-upload-input') as HTMLInputElement
                              if (input) input.click()
                            }}
                          >
                            <Upload className="w-4 h-4 mr-2" /> Upload
                          </Button>
                        </div>
                        <input 
                          type="file" 
                          id="id-upload-input" 
                          accept="image/*" 
                          className="hidden" 
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file && selectedIdType) {
                              const previewUrl = URL.createObjectURL(file)
                              setNewTenantIdDocs(prev => [...prev, { type: selectedIdType, file, previewUrl }])
                              setSelectedIdType("") // reset after upload
                            }
                            e.target.value = '' // Reset input
                          }} 
                        />
                      </div>
                    )}
                  </div>

                  <div className="grid gap-2">
                    <Label>Initial Notes</Label>
                    <Textarea 
                      placeholder="Any specific requirements, food preferences, etc." 
                      className="h-20 resize-none" 
                      value={newTenantNotes}
                      onChange={e => setNewTenantNotes(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="p-6 pt-4 border-t bg-background shrink-0 flex justify-end gap-3">
             <Button variant="outline" disabled={isSaving} onClick={() => { resetAddForm(); setIsAddDialogOpen(false); }}>Cancel</Button>
             <Button onClick={handleSaveTenant} disabled={isSaving}>{isSaving ? "Saving..." : "Save Tenant"}</Button>
          </div>
        </DialogContent>
      </Dialog>


      {/* Edit Tenant is now handled inline in the sidebar above */}

      {/* 3. Change Room Dialog */}
      <Dialog open={!!changeRoomTenantId} onOpenChange={(open) => { if (!open) { setChangeRoomTenantId(null); setChangeRoomNewRoomId(""); setChangeRoomFloor(""); } }}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Home className="h-5 w-5 text-primary" /> Change Room
            </DialogTitle>
            <DialogDescription>
              Moving <strong>{changeRoomTenant?.name}</strong> from Room <strong>{changeRoomTenant?.roomNumber}</strong> to a new room.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid gap-2">
              <Label>Filter by Floor</Label>
              <Select value={changeRoomFloor} onValueChange={(v) => { setChangeRoomFloor(v); setChangeRoomNewRoomId(""); }}>
                <SelectTrigger><SelectValue placeholder="Select a floor" /></SelectTrigger>
                <SelectContent>
                  {Array.from(new Set(rooms.map(r => r.floor_no))).sort().map(floor => (
                    <SelectItem key={floor} value={floor.toString()}>
                      {floor === 0 ? 'Ground' : floor} Floor
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Select New Room <span className="text-destructive">*</span></Label>
              <Select value={changeRoomNewRoomId} onValueChange={setChangeRoomNewRoomId}>
                <SelectTrigger><SelectValue placeholder="Select a room" /></SelectTrigger>
                <SelectContent>
                  {rooms
                    .filter(r => {
                      const hasAvailableBeds = ((r.total_beds || 0) - (r.occupied_beds || 0)) > 0
                      const matchesFloor = r.floor_no.toString() === changeRoomFloor
                      const notCurrentRoom = r.id !== changeRoomTenant?.roomId
                      return hasAvailableBeds && matchesFloor && notCurrentRoom
                    })
                    .map(room => (
                      <SelectItem key={room.id} value={room.id.toString()}>
                        {room.room_number} ({(room.total_beds || 0) - (room.occupied_beds || 0)} beds available)
                      </SelectItem>
                    ))
                  }
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChangeRoomTenantId(null)}>Cancel</Button>
            <Button onClick={handleChangeRoom} disabled={isChangingRoom || !changeRoomNewRoomId}>
              {isChangingRoom ? "Moving..." : "Confirm Change"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 4. Move-Out Workflow Dialog */}
      <Dialog open={!!moveOutTenantId} onOpenChange={(open) => !open && setMoveOutTenantId(null)}>
        <DialogContent className="sm:max-w-[500px] max-h-[85vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="p-6 pb-2">
            <DialogTitle className="text-destructive flex items-center gap-2">
              <UserMinus className="h-5 w-5" /> Start Move-Out Process
            </DialogTitle>
            <DialogDescription>
              Initiate move-out and calculate final settlement for {movingOutTenant?.name}.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1 px-6">
            {movingOutTenant && (
              <div className="space-y-6 py-4">
               <div className="rounded-lg border bg-muted/30 p-4 flex justify-between items-center text-sm">
                 <span className="text-muted-foreground">Original Deposit:</span>
                 <span className="font-semibold text-lg">₹{movingOutTenant.deposit.toLocaleString()}</span>
               </div>
               
               <div className="grid gap-4 sm:grid-cols-2">
                 <div className="grid gap-2">
                    <Label>Move-out Date <span className="text-destructive">*</span></Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant={"outline"}
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !moveOutDate && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {moveOutDate ? format(moveOutDate, "PPP") : <span>Pick a date</span>}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={moveOutDate}
                          onSelect={setMoveOutDate}
                          initialFocus
                          className="rounded-md border shadow"
                        />
                      </PopoverContent>
                    </Popover>
                 </div>
                 <div className="grid gap-2">
                    <Label>Reason</Label>
                    <Select defaultValue="city">
                      <SelectTrigger><SelectValue/></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="city">Leaving City</SelectItem>
                        <SelectItem value="pg">Switching PG</SelectItem>
                        <SelectItem value="personal">Personal Reasons</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                 </div>
               </div>

               <div className="space-y-4 border-t pt-4">
                 <h4 className="font-medium text-sm">Deposit Deductions (₹)</h4>
                 <div className="grid grid-cols-3 gap-4">
                    <div className="grid gap-2">
                      <Label className="text-xs">Pending Rent</Label>
                      <Input type="number" defaultValue="0" onWheel={(e) => (e.target as HTMLElement).blur()} />
                    </div>
                    <div className="grid gap-2">
                      <Label className="text-xs">Damages</Label>
                      <Input type="number" defaultValue="0" onWheel={(e) => (e.target as HTMLElement).blur()} />
                    </div>
                    <div className="grid gap-2">
                      <Label className="text-xs">Cleaning</Label>
                      <Input type="number" defaultValue="500" onWheel={(e) => (e.target as HTMLElement).blur()} />
                    </div>
                 </div>
               </div>

               <div className="space-y-4 border-t pt-4">
                 <h4 className="font-medium text-sm">Refund Details</h4>
                 <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label>Refund Method</Label>
                      <Select defaultValue="upi">
                        <SelectTrigger><SelectValue/></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="upi">UPI</SelectItem>
                          <SelectItem value="bank">Bank Transfer</SelectItem>
                          <SelectItem value="cash">Cash</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label>Final Refund Amount</Label>
                      <Input type="number" defaultValue={movingOutTenant.deposit - 500} className="font-semibold text-success border-success/50" onWheel={(e) => (e.target as HTMLElement).blur()} />
                    </div>
                 </div>
               </div>
            </div>
          )}
            </ScrollArea>
            <div className="p-6 pt-4 border-t bg-background mt-auto flex justify-end gap-3">
               <Button variant="outline" onClick={() => setMoveOutTenantId(null)}>Cancel</Button>
               <Button variant="destructive" onClick={() => {
                  // Mock setting status to notice period / moved out
                  setMoveOutTenantId(null);
               }}>Confirm Move-Out</Button>
            </div>
        </DialogContent>
      </Dialog>

      {/* Image Preview Dialog */}
      <Dialog open={!!previewImageUrl} onOpenChange={(open) => !open && setPreviewImageUrl(null)}>
        <DialogContent className="sm:max-w-fit p-1 bg-background border rounded-xl overflow-hidden shadow-2xl">
          <div className="absolute top-3 right-3 z-10 flex gap-2">
             <Button variant="secondary" size="icon" className="h-8 w-8 rounded-full shadow-sm" onClick={async () => {
                if (!previewImageUrl) return;
                try {
                  const response = await fetch(previewImageUrl)
                  const blob = await response.blob()
                  const blobUrl = window.URL.createObjectURL(blob)
                  const link = document.createElement('a')
                  link.href = blobUrl
                  link.download = `${previewImageTitle || 'document'}.jpg`
                  document.body.appendChild(link)
                  link.click()
                  document.body.removeChild(link)
                  window.URL.revokeObjectURL(blobUrl)
                } catch (err) {
                  console.error("Failed to download image", err)
                  toast({ title: "Error", description: "Failed to download image.", variant: "destructive" })
                }
             }}>
               <Download className="w-4 h-4" />
             </Button>
             <Button variant="secondary" size="icon" className="h-8 w-8 rounded-full shadow-sm" onClick={() => setPreviewImageUrl(null)}>
               <X className="w-4 h-4" />
             </Button>
          </div>
          {previewImageUrl && (
            <div className="w-full h-full max-h-[80vh] flex items-center justify-center p-2 rounded-lg bg-muted/30">
               <img src={previewImageUrl} alt={previewImageTitle} className="max-w-[80vw] max-h-[75vh] object-contain rounded-md" />
            </div>
          )}
        </DialogContent>
      </Dialog>

    </DashboardLayout>
  )
}

export default function TenantsPage() {
  return (
    <Suspense fallback={null}>
      <TenantsPageContent />
    </Suspense>
  )
}
