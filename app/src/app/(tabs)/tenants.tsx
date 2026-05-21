import { useState, useEffect, useCallback, useMemo } from "react"
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Modal, TextInput, Linking, Alert, Platform } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useLocalSearchParams, router } from "expo-router"
import { useAuth } from "@/context/auth"
import { supabase } from "@/lib/supabase"
import { Plus, X, Search, Phone, Mail, Calendar, CreditCard, ChevronRight, User, Hotel, Edit3, Trash2 } from "lucide-react-native"
import * as Haptics from "expo-haptics"
import useTheme from "@/hooks/use-theme"
import { FlashList } from "@shopify/flash-list"
import { KeyboardAwareScrollView, useKeyboardAwareInput } from "@/components/ui/keyboard-aware-scroll-view"

type Tenant = {
  id: number
  name: string | null
  mobile_number: string | null
  email: string | null
  join_date: string | null
  exit_date: string | null
  deposit_amount: number | null
  deposit_refund_amount: number | null
  extra_charges: number | null
  notes: string | null
  rent_due_day: number | null
  room_id: number | null
  status: "active" | "pending_move_in" | "notice_period" | "move_out"
  pg_id: number | null
  rooms_table?: {
    id: number
    room_number: string
    rent_amount: number
  } | null
}

type RoomOption = {
  id: number
  room_number: string
  occupied_beds: number
  total_beds: number
  rent_amount: number
}

export default function TenantsScreen() {
  const { isDark } = useTheme()
  const { user } = useAuth()
  const { tenant: tenantParam } = useLocalSearchParams<{ tenant?: string }>()
  const [loading, setLoading] = useState(true)
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [rooms, setRooms] = useState<RoomOption[]>([])
  const [pgId, setPgId] = useState<number | null>(null)

  const nameInput = useKeyboardAwareInput()
  const mobileInput = useKeyboardAwareInput()
  const emailInput = useKeyboardAwareInput()
  const joinDateInput = useKeyboardAwareInput()
  const rentDueDayInput = useKeyboardAwareInput()
  const depositInput = useKeyboardAwareInput()
  const extraChargesInput = useKeyboardAwareInput()
  const notesInput = useKeyboardAwareInput()

  // Filters
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")

  // Modal / Drawer state
  const [formModalVisible, setFormModalVisible] = useState(false)
  const [detailModalVisible, setDetailModalVisible] = useState(false)
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null)
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Form fields
  const [name, setName] = useState("")
  const [mobileNumber, setMobileNumber] = useState("")
  const [email, setEmail] = useState("")
  const [joinDate, setJoinDate] = useState("")
  const [rentDueDay, setRentDueDay] = useState("5")
  const [depositAmount, setDepositAmount] = useState("10000")
  const [extraCharges, setExtraCharges] = useState("0")
  const [selectedRoomId, setSelectedRoomId] = useState<string>("")
  const [tenantStatus, setTenantStatus] = useState<Tenant["status"]>("active")
  const [notes, setNotes] = useState("")

  const fetchData = useCallback(async () => {
    if (!user?.id) return
    try {
      setLoading(true)

      // Get PG details
      const { data: pgDetails } = await supabase
        .from("pg_details")
        .select("id")
        .eq("owner_id", user.id)
        .maybeSingle()

      if (!pgDetails) return
      setPgId(pgDetails.id)

      // Get Tenants with Room Details
      const { data: tenantsData, error: tenantsErr } = await supabase
        .from("tenants_table")
        .select("*, rooms_table(id, room_number, rent_amount)")
        .eq("owner_id", user.id)
        .order("name", { ascending: true })

      if (tenantsErr) throw tenantsErr
      setTenants(tenantsData || [])

      // Get Rooms to assign
      const { data: roomsData, error: roomsErr } = await supabase
        .from("rooms_table")
        .select("id, room_number, occupied_beds, total_beds, rent_amount")
        .eq("pg_id", pgDetails.id)
        .order("room_number", { ascending: true })

      if (roomsErr) throw roomsErr
      setRooms(roomsData || [])
    } catch (err) {
      console.error("Error fetching tenants:", err)
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  // Realtime subscription
  useEffect(() => {
    if (!pgId || !user?.id) return

    const channel = supabase
      .channel(`tenants_realtime_${pgId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tenants_table", filter: `owner_id=eq.${user.id}` },
        () => {
          void fetchData()
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [pgId, user?.id, fetchData])

  const handleCallTenant = async (mobile: string | null) => {
    if (!mobile) return
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    const telUrl = `tel:${mobile}`
    const canCall = await Linking.canOpenURL(telUrl)

    if (canCall) {
      void Linking.openURL(telUrl)
      return
    }

    Alert.alert(
      "Call Not Supported",
      `Calling is not available on this device/browser. Number: ${mobile}`
    )
  }

  const openDetailSheet = (tenant: Tenant) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setSelectedTenant(tenant)
    setDetailModalVisible(true)
  }

  useEffect(() => {
    if (!tenantParam || loading || tenants.length === 0) return
    const id = Number(tenantParam)
    if (!Number.isFinite(id)) return
    const match = tenants.find((t) => t.id === id)
    if (match) {
      openDetailSheet(match)
      router.setParams({ tenant: undefined })
    }
  }, [tenantParam, loading, tenants])

  const openAddModal = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setEditingTenant(null)
    setName("")
    setMobileNumber("")
    setEmail("")
    setJoinDate(new Date().toISOString().split("T")[0])
    setRentDueDay("5")
    setDepositAmount("10000")
    setExtraCharges("0")
    setSelectedRoomId("")
    setTenantStatus("active")
    setNotes("")
    setError(null)
    setFormModalVisible(true)
  }

  const openEditModal = (tenant: Tenant) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setEditingTenant(tenant)
    setName(tenant.name || "")
    setMobileNumber(tenant.mobile_number || "")
    setEmail(tenant.email || "")
    setJoinDate(tenant.join_date || "")
    setRentDueDay((tenant.rent_due_day || 5).toString())
    setDepositAmount((tenant.deposit_amount || 0).toString())
    setExtraCharges((tenant.extra_charges || 0).toString())
    setSelectedRoomId(tenant.room_id ? tenant.room_id.toString() : "")
    setTenantStatus(tenant.status)
    setNotes(tenant.notes || "")
    setError(null)
    setDetailModalVisible(false) // Close detail if editing from detail sheet
    setFormModalVisible(true)
  }

  const handleSaveTenant = async () => {
    if (!user?.id || !pgId) return

    if (!name.trim()) {
      setError("Name is required")
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      return
    }

    try {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
      const targetRoomId = selectedRoomId ? parseInt(selectedRoomId, 10) : null

      const tenantPayload = {
        name: name.trim(),
        mobile_number: mobileNumber.trim() || null,
        email: email.trim() || null,
        join_date: joinDate || null,
        rent_due_day: parseInt(rentDueDay, 10) || 5,
        deposit_amount: parseInt(depositAmount, 10) || 0,
        extra_charges: parseInt(extraCharges, 10) || 0,
        room_id: targetRoomId,
        status: tenantStatus,
        notes: notes.trim() || null,
        owner_id: user.id,
        pg_id: pgId
      }

      let oldRoomId: number | null = null
      if (editingTenant) {
        oldRoomId = editingTenant.room_id
        
        // Update tenant
        const { error: editErr } = await supabase
          .from("tenants_table")
          .update(tenantPayload)
          .eq("id", editingTenant.id)

        if (editErr) throw editErr
      } else {
        // Insert tenant
        const { error: insertErr } = await supabase
          .from("tenants_table")
          .insert(tenantPayload)

        if (insertErr) throw insertErr
      }

      // Update occupied beds on the rooms if room assignment changed
      if (targetRoomId !== oldRoomId) {
        // Increment new room occupied beds
        if (targetRoomId) {
          const matchedRoom = rooms.find(r => r.id === targetRoomId)
          if (matchedRoom) {
            await supabase
              .from("rooms_table")
              .update({ occupied_beds: Math.min(matchedRoom.occupied_beds + 1, matchedRoom.total_beds) })
              .eq("id", targetRoomId)
          }
        }
        // Decrement old room occupied beds
        if (oldRoomId) {
          const matchedRoom = rooms.find(r => r.id === oldRoomId)
          if (matchedRoom) {
            await supabase
              .from("rooms_table")
              .update({ occupied_beds: Math.max(matchedRoom.occupied_beds - 1, 0) })
              .eq("id", oldRoomId)
          }
        }
      }

      setFormModalVisible(false)
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      void fetchData()
    } catch (err: any) {
      console.error(err)
      setError(err?.message || "An error occurred while saving the tenant")
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
    }
  }

  const handleDeleteTenant = async (tenantId: number, roomId: number | null) => {
    try {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
      
      const { error: deleteErr } = await supabase
        .from("tenants_table")
        .delete()
        .eq("id", tenantId)

      if (deleteErr) throw deleteErr

      // Dec old room beds if deleted
      if (roomId) {
        const matchedRoom = rooms.find(r => r.id === roomId)
        if (matchedRoom) {
          await supabase
            .from("rooms_table")
            .update({ occupied_beds: Math.max(matchedRoom.occupied_beds - 1, 0) })
            .eq("id", roomId)
        }
      }

      setDetailModalVisible(false)
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      void fetchData()
    } catch (err: any) {
      console.error(err)
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
    }
  }

  // Filter available rooms
  const availableRooms = useMemo(() => {
    return rooms.filter((room) => {
      // Show room if beds available OR if it's the current room of editing tenant
      const hasAvailableBeds = room.occupied_beds < room.total_beds
      const isCurrentTenantRoom = editingTenant?.room_id === room.id
      return hasAvailableBeds || isCurrentTenantRoom
    })
  }, [rooms, editingTenant])

  // Filtered tenants
  const filteredTenants = tenants.filter((tenant) => {
    const nameMatch = (tenant.name || "").toLowerCase().includes(searchQuery.toLowerCase())
    const phoneMatch = (tenant.mobile_number || "").includes(searchQuery)
    const statusMatch = statusFilter === "all" || tenant.status === statusFilter
    return (nameMatch || phoneMatch) && statusMatch
  })

  if (loading && tenants.length === 0) {
    return (
      <View className="flex-1 bg-background dark:bg-background-dark items-center justify-center">
        <ActivityIndicator size="large" color={isDark ? "#0091ff" : "#0071df"} />
        <Text className="text-sm text-muted dark:text-muted-dark mt-3">Fetching tenants...</Text>
      </View>
    )
  }

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-background-dark" edges={["top"]}>
      {/* Header */}
      <View className="px-6 pt-4 pb-3 flex-row justify-between items-center">
        <View>
          <Text className="text-2xl font-black text-foreground dark:text-foreground-dark tracking-tight">
            Tenants
          </Text>
          <Text className="text-sm text-muted dark:text-muted-dark font-medium mt-1">
            Manage occupants directory ({filteredTenants.length} people)
          </Text>
        </View>
        <TouchableOpacity
          onPress={openAddModal}
          className="h-10 w-10 bg-primary rounded-xl items-center justify-center shadow-lg shadow-primary/20"
        >
          <Plus size={20} color="#ffffff" />
        </TouchableOpacity>
      </View>

      {/* Search Input */}
      <View className="px-6 mb-4">
        <View className="flex-row items-center border border-border dark:border-border-dark bg-card dark:bg-card-dark rounded-2xl px-4 py-2.5 shadow-sm">
          <View className="mr-3">
            <Search size={18} color="#9ca3af" />
          </View>
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search by name or mobile..."
            placeholderTextColor="#9ca3af"
            className="flex-1 text-base text-foreground dark:text-foreground-dark"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery("")}>
              <X size={18} color="#9ca3af" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Filter Tabs */}
      <View className="h-12 mb-2">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 24, alignItems: "center" }}
        >
          {["all", "active", "pending_move_in", "notice_period", "move_out"].map((status) => (
            <TouchableOpacity
              key={`${status}-${statusFilter === status}`}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                setStatusFilter(status)
              }}
              className={`px-5 py-2 rounded-xl mr-2 border capitalize ${
                statusFilter === status
                  ? "bg-primary border-primary"
                  : "bg-card dark:bg-card-dark border-border dark:border-border-dark"
              }`}
            >
              <Text
                className={`text-xs font-bold ${
                  statusFilter === status ? "text-white" : "text-muted dark:text-muted-dark"
                }`}
              >
                {status.replace(/_/g, " ")}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Tenant Directory */}
      {filteredTenants.length === 0 ? (
        <View className="flex-1 items-center justify-center px-12">
          <User size={48} color="#9ca3af" />
          <Text className="text-sm font-semibold text-muted dark:text-muted-dark mt-4 text-center">
            No tenants found
          </Text>
        </View>
      ) : (
        <View className="flex-1 px-6">
          <FlashList
            data={filteredTenants}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => {
              let badgeColor = "bg-success/10 text-success"
              if (item.status === "notice_period") badgeColor = "bg-warning/10 text-warning"
              if (item.status === "move_out") badgeColor = "bg-destructive/10 text-destructive"
              if (item.status === "pending_move_in") badgeColor = "bg-primary/10 text-primary"

              return (
                <TouchableOpacity
                  onPress={() => openDetailSheet(item)}
                  className="flex-row items-center bg-card dark:bg-card-dark border border-border dark:border-border-dark p-4 rounded-3xl mb-3 shadow-sm justify-between"
                >
                  <View className="flex-row items-center flex-1 pr-4">
                    {/* Circle avatar */}
                    <View className="h-11 w-11 bg-primary/10 rounded-full items-center justify-center mr-3.5">
                      <User size={20} color={isDark ? "#0091ff" : "#0071df"} />
                    </View>

                    <View className="flex-1">
                      <View className="flex-row items-center flex-wrap">
                        <Text className="text-base font-bold text-foreground dark:text-foreground-dark mr-2" numberOfLines={1}>
                          {item.name}
                        </Text>
                        <View className={`px-2 py-0.5 rounded-md ${badgeColor}`}>
                          <Text className="text-[8px] font-black uppercase">
                            {item.status.replace(/_/g, " ")}
                          </Text>
                        </View>
                      </View>

                      <View className="flex-row items-center mt-1 gap-4">
                        <View className="flex-row items-center">
                          <View className="mr-1">
                            <Hotel size={12} color="#9ca3af" />
                          </View>
                          <Text className="text-xs text-muted dark:text-muted-dark font-medium">
                            Room {item.rooms_table?.room_number || "Unassigned"}
                          </Text>
                        </View>
                        {item.mobile_number && (
                          <View className="flex-row items-center">
                            <View className="mr-1">
                              <Phone size={12} color="#9ca3af" />
                            </View>
                            <Text className="text-xs text-muted dark:text-muted-dark font-medium">
                              {item.mobile_number}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </View>

                  <ChevronRight size={18} color="#9ca3af" />
                </TouchableOpacity>
              )
            }}
          />
        </View>
      )}

      {/* Drawer 1: Tenant Detail Sheet */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={detailModalVisible}
        onRequestClose={() => setDetailModalVisible(false)}
      >
        <View className="flex-1 bg-black/60 justify-end">
          <View className="bg-card dark:bg-card-dark rounded-t-[36px] max-h-[85%] border-t border-border dark:border-border-dark p-6">
            {selectedTenant && (
              <View className="gap-6">
                {/* Header */}
                <View className="flex-row justify-between items-start">
                  <View className="flex-row items-center">
                    <View className="h-14 w-14 bg-primary/10 rounded-full items-center justify-center mr-4">
                      <User size={28} color={isDark ? "#0091ff" : "#0071df"} />
                    </View>
                    <View>
                      <Text className="text-xl font-black text-foreground dark:text-foreground-dark">
                        {selectedTenant.name}
                      </Text>
                      <View className="flex-row items-center mt-1">
                        <View className="px-2 py-0.5 rounded-md bg-primary/10 mr-2">
                          <Text className="text-[9px] font-black text-primary uppercase">
                            Room {selectedTenant.rooms_table?.room_number || "N/A"}
                          </Text>
                        </View>
                        <Text className="text-xs text-muted capitalize font-bold">
                          {selectedTenant.status.replace(/_/g, " ")}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={() => setDetailModalVisible(false)}
                    className="h-8 w-8 bg-background dark:bg-background-dark border border-border dark:border-border-dark rounded-full items-center justify-center"
                  >
                    <X size={16} color="#9ca3af" />
                  </TouchableOpacity>
                </View>

                {/* Details List */}
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 16 }} className="max-h-[60%]">
                  {/* Phone */}
                  {selectedTenant.mobile_number && (
                    <View className="flex-row items-center justify-between py-3 border-b border-border/40 dark:border-border-dark/40">
                      <View className="flex-row items-center">
                        <View className="mr-3">
                          <Phone size={16} color="#9ca3af" />
                        </View>
                        <Text className="text-sm font-semibold text-muted dark:text-muted-dark">Phone Number</Text>
                      </View>
                      <TouchableOpacity onPress={() => handleCallTenant(selectedTenant.mobile_number)} className="flex-row items-center bg-primary/10 px-3 py-1.5 rounded-xl">
                        <Text className="text-xs font-black text-primary mr-1.5">{selectedTenant.mobile_number}</Text>
                        <Phone size={12} color={isDark ? "#0091ff" : "#0071df"} />
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Email */}
                  {selectedTenant.email && (
                    <View className="flex-row items-center justify-between py-3 border-b border-border/40 dark:border-border-dark/40">
                      <View className="flex-row items-center">
                        <View className="mr-3">
                          <Mail size={16} color="#9ca3af" />
                        </View>
                        <Text className="text-sm font-semibold text-muted dark:text-muted-dark">Email Address</Text>
                      </View>
                      <Text className="text-sm font-bold text-foreground dark:text-foreground-dark">{selectedTenant.email}</Text>
                    </View>
                  )}

                  {/* Join Date */}
                  <View className="flex-row items-center justify-between py-3 border-b border-border/40 dark:border-border-dark/40">
                    <View className="flex-row items-center">
                      <View className="mr-3">
                        <Calendar size={16} color="#9ca3af" />
                      </View>
                      <Text className="text-sm font-semibold text-muted dark:text-muted-dark">Joining Date</Text>
                    </View>
                    <Text className="text-sm font-bold text-foreground dark:text-foreground-dark">
                      {selectedTenant.join_date || "Not set"}
                    </Text>
                  </View>

                  {/* Monthly Rent Due Date */}
                  <View className="flex-row items-center justify-between py-3 border-b border-border/40 dark:border-border-dark/40">
                    <View className="flex-row items-center">
                      <View className="mr-3">
                        <Calendar size={16} color="#9ca3af" />
                      </View>
                      <Text className="text-sm font-semibold text-muted dark:text-muted-dark">Rent Due Day</Text>
                    </View>
                    <Text className="text-sm font-bold text-foreground dark:text-foreground-dark">
                      Every {selectedTenant.rent_due_day || 5}th of month
                    </Text>
                  </View>

                  {/* Deposit Amount */}
                  <View className="flex-row items-center justify-between py-3 border-b border-border/40 dark:border-border-dark/40">
                    <View className="flex-row items-center">
                      <View className="mr-3">
                        <CreditCard size={16} color="#9ca3af" />
                      </View>
                      <Text className="text-sm font-semibold text-muted dark:text-muted-dark">Security Deposit</Text>
                    </View>
                    <Text className="text-sm font-bold text-foreground dark:text-foreground-dark">
                      ₹{(selectedTenant.deposit_amount || 0).toLocaleString()}
                    </Text>
                  </View>

                  {/* Extra Charges */}
                  <View className="flex-row items-center justify-between py-3 border-b border-border/40 dark:border-border-dark/40">
                    <View className="flex-row items-center">
                      <View className="mr-3">
                        <CreditCard size={16} color="#9ca3af" />
                      </View>
                      <Text className="text-sm font-semibold text-muted dark:text-muted-dark">Extra Charges</Text>
                    </View>
                    <Text className="text-sm font-bold text-foreground dark:text-foreground-dark">
                      ₹{(selectedTenant.extra_charges || 0).toLocaleString()}
                    </Text>
                  </View>

                  {/* Notes */}
                  {selectedTenant.notes && (
                    <View className="py-3">
                      <Text className="text-sm font-semibold text-muted dark:text-muted-dark mb-1.5">Tenant Notes</Text>
                      <View className="bg-background dark:bg-background-dark p-3.5 rounded-2xl border border-border/60 dark:border-border-dark/60">
                        <Text className="text-sm text-foreground dark:text-foreground-dark leading-5">{selectedTenant.notes}</Text>
                      </View>
                    </View>
                  )}
                </ScrollView>

                {/* Primary Actions */}
                <View className="flex-row gap-3 pb-6">
                  <TouchableOpacity
                    onPress={() => handleDeleteTenant(selectedTenant.id, selectedTenant.room_id)}
                    className="h-12 w-12 border border-destructive/20 bg-destructive/5 rounded-xl items-center justify-center"
                  >
                    <Trash2 size={20} color="#ef4444" />
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => openEditModal(selectedTenant)}
                    className="flex-1 bg-primary rounded-xl h-12 items-center justify-center flex-row shadow-lg shadow-primary/20"
                  >
                    <View className="mr-2">
                      <Edit3 size={18} color="#ffffff" />
                    </View>
                    <Text className="text-white text-base font-bold">Edit Profile</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>

      <Modal
        animationType="slide"
        transparent={true}
        visible={formModalVisible}
        onRequestClose={() => setFormModalVisible(false)}
      >
        <View className="flex-1 bg-black/60 justify-end">
          <View className="bg-card dark:bg-card-dark rounded-t-[36px] max-h-[85%] border-t border-border dark:border-border-dark p-6">
            {/* Header */}
            <View className="flex-row justify-between items-center mb-6">
              <View>
                <Text className="text-xl font-black text-foreground dark:text-foreground-dark">
                  {editingTenant ? `Edit ${editingTenant.name}` : "Add Occupant"}
                </Text>
                <Text className="text-xs text-muted mt-0.5 font-medium">Configure tenant profile</Text>
              </View>
              <TouchableOpacity
                onPress={() => setFormModalVisible(false)}
                className="h-8 w-8 bg-background dark:bg-background-dark border border-border dark:border-border-dark rounded-full items-center justify-center"
              >
                <X size={16} color="#9ca3af" />
              </TouchableOpacity>
            </View>

            {error && (
              <View className="bg-destructive/10 border border-destructive/20 p-3 rounded-xl mb-4">
                <Text className="text-destructive text-sm font-medium">{error}</Text>
              </View>
            )}

            <KeyboardAwareScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 16, paddingBottom: 24 }} className="mb-6">
              {/* Full Name */}
              <View>
                <Text className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">Tenant Name</Text>
                <TextInput
                  ref={nameInput.ref}
                  onFocus={nameInput.onFocus}
                  value={name}
                  onChangeText={setName}
                  placeholder="e.g. Alice Smith"
                  placeholderTextColor="#9ca3af"
                  className="border border-border dark:border-border-dark rounded-xl px-3.5 py-2.5 text-base text-foreground dark:text-foreground-dark bg-background dark:bg-background-dark"
                />
              </View>

              {/* Mobile Number */}
              <View>
                <Text className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">Mobile Number</Text>
                <TextInput
                  ref={mobileInput.ref}
                  onFocus={mobileInput.onFocus}
                  value={mobileNumber}
                  onChangeText={setMobileNumber}
                  keyboardType="phone-pad"
                  placeholder="10-digit number"
                  placeholderTextColor="#9ca3af"
                  className="border border-border dark:border-border-dark rounded-xl px-3.5 py-2.5 text-base text-foreground dark:text-foreground-dark bg-background dark:bg-background-dark"
                />
              </View>

              {/* Email */}
              <View>
                <Text className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">Email Address</Text>
                <TextInput
                  ref={emailInput.ref}
                  onFocus={emailInput.onFocus}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  placeholder="e.g. alice@example.com"
                  placeholderTextColor="#9ca3af"
                  className="border border-border dark:border-border-dark rounded-xl px-3.5 py-2.5 text-base text-foreground dark:text-foreground-dark bg-background dark:bg-background-dark"
                />
              </View>

              {/* Grid: Join Date & Rent Due Day */}
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Text className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">Join Date</Text>
                  <TextInput
                    ref={joinDateInput.ref}
                    onFocus={joinDateInput.onFocus}
                    value={joinDate}
                    onChangeText={setJoinDate}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="#9ca3af"
                    className="border border-border dark:border-border-dark rounded-xl px-3.5 py-2.5 text-base text-foreground dark:text-foreground-dark bg-background dark:bg-background-dark"
                  />
                </View>

                <View className="flex-1">
                  <Text className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">Rent Due Day</Text>
                  <TextInput
                    ref={rentDueDayInput.ref}
                    onFocus={rentDueDayInput.onFocus}
                    value={rentDueDay}
                    onChangeText={setRentDueDay}
                    keyboardType="numeric"
                    placeholder="e.g. 5"
                    placeholderTextColor="#9ca3af"
                    className="border border-border dark:border-border-dark rounded-xl px-3.5 py-2.5 text-base text-foreground dark:text-foreground-dark bg-background dark:bg-background-dark"
                  />
                </View>
              </View>

              {/* Room Assignment Choice (Horizontal Scrollable Picker) */}
              <View>
                <Text className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">Select Room Assignment</Text>
                {availableRooms.length === 0 ? (
                  <Text className="text-xs text-destructive font-semibold">No vacant beds available. Add a room first!</Text>
                ) : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row py-1">
                    {availableRooms.map((room) => (
                      <TouchableOpacity
                        key={room.id}
                        onPress={() => {
                          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                          setSelectedRoomId(room.id.toString())
                        }}
                        className={`px-4 py-2.5 rounded-xl mr-2 border ${
                          selectedRoomId === room.id.toString()
                            ? "bg-primary/10 border-primary"
                            : "bg-background dark:bg-background-dark border-border dark:border-border-dark"
                        }`}
                      >
                        <Text className={`text-xs font-extrabold ${selectedRoomId === room.id.toString() ? "text-primary" : "text-muted"}`}>
                          Room {room.room_number} ({room.occupied_beds}/{room.total_beds} beds)
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
              </View>

              {/* Grid: Deposit & Extra Charges */}
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Text className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">Deposit (₹)</Text>
                  <TextInput
                    ref={depositInput.ref}
                    onFocus={depositInput.onFocus}
                    value={depositAmount}
                    onChangeText={setDepositAmount}
                    keyboardType="numeric"
                    placeholder="10000"
                    placeholderTextColor="#9ca3af"
                    className="border border-border dark:border-border-dark rounded-xl px-3.5 py-2.5 text-base text-foreground dark:text-foreground-dark bg-background dark:bg-background-dark"
                  />
                </View>

                <View className="flex-1">
                  <Text className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">Extra Charges (₹)</Text>
                  <TextInput
                    ref={extraChargesInput.ref}
                    onFocus={extraChargesInput.onFocus}
                    value={extraCharges}
                    onChangeText={setExtraCharges}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor="#9ca3af"
                    className="border border-border dark:border-border-dark rounded-xl px-3.5 py-2.5 text-base text-foreground dark:text-foreground-dark bg-background dark:bg-background-dark"
                  />
                </View>
              </View>

              {/* Status Picker Selector */}
              <View>
                <Text className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">Tenant Status</Text>
                <View className="flex-row bg-background dark:bg-background-dark p-1 rounded-xl border border-border/50 dark:border-border-dark/50 flex-wrap">
                  {["active", "pending_move_in", "notice_period", "move_out"].map((st) => (
                    <TouchableOpacity
                      key={st}
                      onPress={() => {
                        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                        setTenantStatus(st as Tenant["status"])
                      }}
                      className={`px-3 py-2 rounded-lg items-center m-0.5 ${
                        tenantStatus === st ? "bg-white dark:bg-card-dark shadow-sm" : ""
                      }`}
                    >
                      <Text className={`text-[10px] font-extrabold capitalize ${tenantStatus === st ? "text-primary dark:text-foreground-dark" : "text-muted"}`}>
                        {st.replace(/_/g, " ")}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Notes */}
              <View>
                <Text className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2">Custom Notes</Text>
                <TextInput
                  ref={notesInput.ref}
                  onFocus={notesInput.onFocus}
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Office address, emergency contact, ID card ref..."
                  placeholderTextColor="#9ca3af"
                  multiline
                  numberOfLines={2}
                  className="border border-border dark:border-border-dark rounded-xl px-3.5 py-2.5 text-base text-foreground dark:text-foreground-dark bg-background dark:bg-background-dark h-20 text-left"
                />
              </View>
            </KeyboardAwareScrollView>

            {/* Actions */}
            <View className="flex-row gap-3 pb-6">
              <TouchableOpacity
                onPress={() => setFormModalVisible(false)}
                className="flex-1 border border-border dark:border-border-dark rounded-xl py-3.5 items-center justify-center bg-background dark:bg-background-dark"
              >
                <Text className="text-muted dark:text-muted-dark text-sm font-bold">Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleSaveTenant}
                className="flex-1 bg-primary rounded-xl py-3.5 items-center justify-center shadow-lg shadow-primary/20"
              >
                <Text className="text-white text-sm font-bold">Save Occupant</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}
