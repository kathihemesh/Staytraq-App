/**
 * Rooms screen — mirrored from StayTraq web `app/rooms/page.tsx`
 * Layout and interactions tuned for Expo / React Native while preserving the same UX and data flows.
 */

import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
  LayoutAnimation,
  UIManager,
} from "react-native"
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context"
import clsx from "clsx"
import { LinearGradient } from "expo-linear-gradient"
import * as Haptics from "expo-haptics"
import { router, useFocusEffect, useLocalSearchParams } from "expo-router"
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
  Info,
  History,
  Phone,
  Mail,
  CalendarDays,
  ArrowRight,
  ArrowUpDown,
  Trash2,
} from "lucide-react-native"
import { useAuth } from "@/context/auth"
import { supabase } from "@/lib/supabase"
import { scheduleAfterInteractions } from "@/lib/focus-fetch-scheduler"
import useTheme from "@/hooks/use-theme"
import {
  KeyboardAwareScrollView,
  useKeyboardAwareInput,
  useKeyboardHeight,
} from "@/components/ui/keyboard-aware-scroll-view"
import { InlineSelect } from "@/components/ui/inline-select"
import { ConfirmModal } from "@/components/ui/confirm-modal"
import {
  floorNoToLabel,
  getStatusConfig,
  groupTenantsByRoomId,
  mapDbRowToRoom,
  roomTypeToDb,
  type Room,
  type TenantPreview,
} from "@/lib/rooms"

async function runWithNetworkRetry<T>(fn: () => PromiseLike<T>, attempts = 3): Promise<T> {
  let last: unknown
  const delayMs = 450
  for (let i = 0; i < attempts; i++) {
    try {
      return await Promise.resolve(fn())
    } catch (e) {
      last = e
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, delayMs * (i + 1)))
    }
  }
  throw last
}

const STAT_CHIPS = [
  {
    id: "vacant" as const,
    label: "Vacant",
    color: "#10b981",
    text: "text-emerald-600 dark:text-emerald-400",
    border: "border-emerald-300 dark:border-emerald-500/40",
    bg: "bg-emerald-50 dark:bg-emerald-500/10",
  },
  {
    id: "partially occupied" as const,
    label: "Partial",
    color: "#0ea5e9",
    text: "text-sky-600 dark:text-sky-400",
    border: "border-sky-300 dark:border-sky-500/40",
    bg: "bg-sky-50 dark:bg-sky-500/10",
  },
  {
    id: "full" as const,
    label: "Full",
    color: "#f43f5e",
    text: "text-rose-600 dark:text-rose-400",
    border: "border-rose-300 dark:border-rose-500/40",
    bg: "bg-rose-50 dark:bg-rose-500/10",
  },
  {
    id: "maintenance" as const,
    label: "Maintenance",
    color: "#f59e0b",
    text: "text-amber-600 dark:text-amber-400",
    border: "border-amber-300 dark:border-amber-500/40",
    bg: "bg-amber-50 dark:bg-amber-500/10",
  },
  {
    id: "notice_period" as const,
    label: "Notice",
    color: "#8b5cf6",
    text: "text-purple-600 dark:text-purple-400",
    border: "border-purple-300 dark:border-purple-500/40",
    bg: "bg-purple-50 dark:bg-purple-500/10",
  },
]

function occupancyFillPercent(room: Room): number {
  if (room.status === "maintenance") {
    return room.capacity > 0 ? Math.max((room.occupiedBeds / room.capacity) * 100, 20) : 20
  }
  if (room.capacity <= 0) return 0
  if (room.status === "full" || room.occupiedBeds >= room.capacity) return 100
  return (room.occupiedBeds / room.capacity) * 100
}

const MaintenanceStripeFill = memo(function MaintenanceStripeFill({
  widthPct,
}: {
  widthPct: number
}) {
  const full = widthPct >= 99.5
  if (full) {
    return (
      <View className="absolute inset-0 overflow-hidden">
        <LinearGradient
          colors={["rgba(217,119,6,0.38)", "rgba(251,191,36,0.18)", "rgba(217,119,6,0.38)"]}
          locations={[0, 0.5, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ flex: 1, opacity: 0.92 }}
        />
        <LinearGradient
          colors={["rgba(255,255,255,0)", "rgba(255,255,255,0.12)", "rgba(255,255,255,0)"]}
          start={{ x: 0, y: 1 }}
          end={{ x: 1, y: 0 }}
          pointerEvents="none"
          style={StyleSheet.absoluteFillObject}
        />
      </View>
    )
  }
  return (
    <View
      className="absolute inset-y-0 left-0 overflow-hidden"
      style={{
        width: `${Math.min(widthPct, 100)}%`,
        borderTopLeftRadius: 0,
        borderBottomLeftRadius: 0,
        borderTopRightRadius: 0,
        borderBottomRightRadius: 0,
      }}
    >
      <LinearGradient
        colors={["rgba(217,119,6,0.38)", "rgba(251,191,36,0.18)", "rgba(217,119,6,0.38)"]}
        locations={[0, 0.5, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ flex: 1, opacity: 0.92 }}
      />
      <LinearGradient
        colors={["rgba(255,255,255,0)", "rgba(255,255,255,0.12)", "rgba(255,255,255,0)"]}
        start={{ x: 0, y: 1 }}
        end={{ x: 1, y: 0 }}
        pointerEvents="none"
        style={StyleSheet.absoluteFillObject}
      />
    </View>
  )
})

const OccupancyBackdrop = memo(function OccupancyBackdrop({ room }: { room: Room }) {
  const pct = occupancyFillPercent(room)
  if (room.status === "maintenance") {
    return <MaintenanceStripeFill widthPct={pct} />
  }
  const cfg = getStatusConfig(room.status)
  const full = pct >= 99.5
  if (full) {
    return (
      <View
        className={clsx("absolute inset-0", cfg.tintLive, pct <= 0 ? "opacity-0" : "")}
      />
    )
  }
  return (
    <View
      className={clsx(
        "absolute inset-y-0 left-0",
        cfg.tintLive,
        pct <= 0 ? "opacity-0" : "",
      )}
      style={{
        width: `${Math.min(pct, 100)}%`,
        borderTopLeftRadius: 0,
        borderBottomLeftRadius: 0,
        borderTopRightRadius: 0,
        borderBottomRightRadius: 0,
      }}
    />
  )
})

const RoomRowCard = memo(function RoomRowCard({
  room,
  selected,
  isDark,
  onPress,
  compactRent,
  primaryColor,
}: {
  room: Room
  selected: boolean
  isDark: boolean
  compactRent: boolean
  primaryColor: string
  onPress: () => void
}) {
  const config = getStatusConfig(room.status)
  const borderSelected =
    room.status === "vacant"
      ? "border-emerald-400/70 dark:border-emerald-600/55"
      : room.status === "partially occupied"
        ? "border-sky-400/70 dark:border-sky-600/55"
        : room.status === "full"
          ? "border-rose-400/70 dark:border-rose-600/55"
          : "border-amber-400/70 dark:border-amber-600/55"

  return (
    <Pressable
      onPress={onPress}
      className={clsx(
        "mb-1.5 overflow-hidden rounded-xl border shadow-sm active:opacity-95",
        selected
          ? clsx(borderSelected, "bg-slate-50 dark:bg-slate-800/50")
          : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900",
      )}
      style={selected ? { borderCurve: "continuous" } : undefined}
    >
      <OccupancyBackdrop room={room} />
      <View className="relative z-10 flex-row items-center py-2 pl-3 pr-3">
        <View className="flex-1 flex-row items-center gap-2.5 min-w-0">
          <LinearGradient
            colors={[`${primaryColor}12`, `${primaryColor}06`]}
            style={{
              height: 36,
              width: 36,
              borderRadius: 18,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: isDark ? "rgba(0,145,255,0.35)" : "rgba(0,113,223,0.3)",
            }}
          >
            <Text 
              style={{ 
                color: primaryColor,
                fontSize: room.number.length > 5 ? 7.5 : room.number.length === 5 ? 8.5 : room.number.length === 4 ? 9.5 : 11
              }} 
              className="font-black tracking-tighter text-center"
              numberOfLines={1}
            >
              {room.number}
            </Text>
          </LinearGradient>
          <View className="min-w-0 flex-1 justify-center gap-0.5">
            {/* Line 1: Metadata Row */}
            <View className="flex-row items-center gap-x-2">
              <View className="flex-row items-center gap-1">
                <Layers size={10} color={isDark ? "#94a3b8" : "#475569"} />
                <Text className="text-[10px] font-bold text-slate-700 dark:text-slate-300">
                  {room.floorNo === 0 ? "G" : room.floorNo}
                </Text>
              </View>
              <Text className="text-[9px] text-slate-300 dark:text-slate-700">•</Text>
              <View className="flex-row items-center gap-1">
                <Users size={10} color={isDark ? "#94a3b8" : "#475569"} />
                <Text className="text-[10px] font-bold text-slate-700 dark:text-slate-300">
                  {room.occupiedBeds} / {room.capacity}
                </Text>
              </View>
              <Text className="text-[9px] text-slate-300 dark:text-slate-700">•</Text>
              <Text className="text-[10px] font-bold text-slate-700 dark:text-slate-300">
                {room.type === "Non-AC" ? "NON AC" : room.type}
              </Text>
            </View>

            {/* Line 2: Highlighted Price */}
            <View className="flex-row items-center gap-0.5 mt-0.5">
              <IndianRupee size={10} color={primaryColor} />
              <Text style={{ color: primaryColor }} className="text-xs font-black tracking-tight">
                {room.rentAmount.toLocaleString()}
              </Text>
              <Text className="text-[9px] font-bold text-slate-400 dark:text-slate-500"> / month</Text>
            </View>
          </View>
        </View>
        <View className="relative z-10 w-[96px] shrink-0 items-end justify-center">
          <Text className={clsx("rounded-full border px-2 py-0.5 text-[9px] font-semibold text-center", config.badge)}>
            {room.status === "partially occupied" ? "Partial" : config.label}
          </Text>
          {room.status === "maintenance" ? (
            <View className="flex-row items-center gap-1 mt-0.5">
              <Wrench size={9} color="#f59e0b" />
              <Text className="text-[8px] font-semibold text-amber-600 dark:text-amber-400 max-w-[80px]" numberOfLines={1}>
                Under repair
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  )
})

function RoomFieldRow(props: {
  label: string
  isEditing: boolean
  displayValue: string
  editable: React.ReactNode
}) {
  const { label, isEditing, displayValue, editable } = props
  return (
    <View>
      <Text className="mb-2 text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">
        {label}
      </Text>
      {isEditing ? (
        editable
      ) : (
        <Text className="text-sm font-extrabold tracking-wide text-slate-900 dark:text-slate-50">
          {displayValue}
        </Text>
      )}
    </View>
  )
}

/** --- Main screen --- */

export default function RoomsScreen() {
  const { user } = useAuth()
  const params = useLocalSearchParams<{ status?: string; sort?: string }>()
  const { isDark, colorScheme } = useTheme()
  const insets = useSafeAreaInsets()
  const { width, height } = useWindowDimensions()
  const compactRent = width < 380
  const primaryColor = isDark ? "#0091ff" : "#0071df"
  const keyboardHeight = useKeyboardHeight()

  const [rooms, setRooms] = useState<Room[]>([])
  const [tenantsByRoom, setTenantsByRoom] = useState<Record<string, TenantPreview[]>>({})
  const [previewTenant, setPreviewTenant] = useState<TenantPreview | null>(null)

  const [search, setSearch] = useState("")
  const [vacantFirst, setVacantFirst] = useState(true)
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
  const [pgId, setPgId] = useState<number | null>(null)
  const [noFloors, setNoFloors] = useState(0)
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false)

  const [editForm, setEditForm] = useState<Partial<Room>>({})
  const [filters, setFilters] = useState({
    floor: "All Floors",
    type: "All Types",
    status: "All Statuses",
    capacity: "All Beds",
  })
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)

  useEffect(() => {
    if (params.status) {
      setFilters((prev) => ({
        ...prev,
        status: params.status === "notice_period" ? "notice_period" : (params.status === "vacant" ? "vacant" : "All Statuses")
      }))
    }
    if (params.sort === "vacant_first") {
      setVacantFirst(true)
      setFilters((prev) => ({
        ...prev,
        status: "All Statuses"
      }))
      router.setParams({ sort: undefined })
    }
  }, [params.status, params.sort])

  const hasActiveFilters =
    filters.floor !== "All Floors" ||
    filters.type !== "All Types" ||
    filters.capacity !== "All Beds"

  // Enable UIManager layout animations on Android
  useEffect(() => {
    if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true)
    }
  }, [])

  // Smooth layout animation on filter changes
  useEffect(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
  }, [hasActiveFilters])

  const [addForm, setAddForm] = useState<{
    number: string
    floorNo: number | null
    type: "AC" | "Non-AC" | null
    capacity: string
    rentAmount: string
    maintenanceFee: string
    notes: string
  }>({
    number: "",
    floorNo: null,
    type: null,
    capacity: "",
    rentAmount: "",
    maintenanceFee: "",
    notes: "",
  })

  const editNotesRef = useKeyboardAwareInput()
  const addRoomNumberRef = useKeyboardAwareInput()
  const addRoomCapacityRef = useKeyboardAwareInput()
  const addRoomRentRef = useKeyboardAwareInput()
  const addRoomMaintRef = useKeyboardAwareInput()
  const addRoomNotesRef = useKeyboardAwareInput()

  const capacityOptions = useMemo(() => {
    const caps = Array.from(
      new Set(
        rooms
          .map((r) => r.capacity)
          .filter((c) => Number.isFinite(c) && c > 0),
      ),
    ).sort((a, b) => a - b)
    return ["All Beds", ...caps.map((c) => `${c} Beds`)]
  }, [rooms])

  const availableFloors = useMemo(
    () =>
      Array.from({ length: noFloors + 1 }, (_, i) => ({
        value: i,
        label: floorNoToLabel(i),
      })),
    [noFloors],
  )

  const floorFilterOptions = useMemo(
    () =>
      availableFloors.map((f) => ({
        value: f.label,
        shortLabel: f.value === 0 ? "G" : String(f.value),
        listLabel: f.value === 0 ? "G" : String(f.value),
      })),
    [availableFloors],
  )

  const typeFilterOptions = useMemo(
    () => [
      { value: "AC", shortLabel: "AC", listLabel: "AC" },
      { value: "Non-AC", shortLabel: "NON AC", listLabel: "NON AC" },
    ],
    [],
  )

  const capacityFilterOptions = useMemo(
    () =>
      capacityOptions
        .filter((opt) => opt !== "All Beds")
        .map((opt) => ({
          value: opt,
          shortLabel: `${Number.parseInt(opt, 10) || ""}`,
          listLabel: opt.replace(" Beds", ""),
        })),
    [capacityOptions],
  )

  const addFloorOptions = useMemo(
    () =>
      availableFloors.map((f) => ({
        value: String(f.value),
        shortLabel: f.value === 0 ? "G" : String(f.value),
        listLabel: f.value === 0 ? "G" : String(f.value),
      })),
    [availableFloors],
  )

  const fetchData = useCallback(async (silent = false) => {
    if (!user?.id) {
      setIsLoading(false)
      setIsRefreshing(false)
      return
    }
    if (!silent) {
      if (!hasLoadedOnce) setIsLoading(true)
      else setIsRefreshing(true)
    }
    setPageError(null)
    setPgMissing(false)

    try {
      // Fetch pg_details and tenants concurrently
      const [pgResult, tenantsResult] = await Promise.all([
        runWithNetworkRetry(() =>
          supabase.from("pg_details").select("id, no_floors").eq("owner_id", user.id).maybeSingle(),
        ),
        runWithNetworkRetry(() =>
          supabase
            .from("tenants_table")
            .select("id, name, mobile_number, email, room_id, join_date, status, extra_charges, exit_date")
            .eq("owner_id", user.id)
            .neq("status", "move_out"),
        )
      ])

      const pgData = pgResult.data
      const pgError = pgResult.error
      const tenantsData = tenantsResult.data
      const tenantsError = tenantsResult.error

      if (pgError) {
        const msg =
          typeof pgError?.message === "string" ? pgError.message : "Failed to load PG details."
        setPageError(msg)
        setRooms([])
        setPgId(null)
      } else if (!pgData?.id) {
        setPgId(null)
        setRooms([])
        setTenantsByRoom({})
        setPgMissing(true)
      } else {
        setPgId(pgData.id)
        const nextNoFloors =
          pgData.no_floors === null || pgData.no_floors === undefined ? 0 : Number(pgData.no_floors)
        setNoFloors(Number.isFinite(nextNoFloors) ? nextNoFloors : 0)

        const { data: roomsData, error: roomsError } = await runWithNetworkRetry(() =>
          supabase
            .from("rooms_table")
            .select(
              "id, pg_id, room_number, floor_no, room_type, status, total_beds, occupied_beds, rent_amount, maintenance, notes",
            )
            .eq("pg_id", pgData.id)
            .order("floor_no", { ascending: true })
            .order("room_number", { ascending: true }),
        )

        if (roomsError) {
          const msg =
            typeof roomsError?.message === "string"
              ? roomsError.message
              : "Failed to load rooms."
          setPageError(msg)
          setRooms([])
        } else {
          const mapped = (roomsData || []).map(mapDbRowToRoom)
          setRooms(mapped)
          if (tenantsError) {
            console.error(tenantsError)
          }
          setTenantsByRoom(groupTenantsByRoomId(tenantsData || [], mapped))
        }
      }
    } catch (err) {
      console.error(err)
      setPageError("Unexpected error while loading rooms.")
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
      setHasLoadedOnce(true)
    }
  }, [user?.id, hasLoadedOnce])

  useFocusEffect(
    useCallback(() => {
      if (user?.id) {
        // Defer the on-focus fetch past the navigation transition / first interactive
        // paint so it no longer blocks the destination's first paint (Change A). The
        // cached/skeleton shell renders first; the load runs once per focus afterwards
        // and is cancelled on blur-before-run so loads are neither dropped nor duplicated.
        const handle = scheduleAfterInteractions(() => {
          void fetchData(hasLoadedOnce)
        })
        return () => handle.cancel()
      }
    }, [user?.id, fetchData, hasLoadedOnce])
  )

  const selectedRoomIdRef = useRef<string | null>(null)
  useEffect(() => {
    selectedRoomIdRef.current = selectedRoom?.id ?? null
  }, [selectedRoom?.id])

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
            const next = mapDbRowToRoom(payload.new as Parameters<typeof mapDbRowToRoom>[0])
            setRooms((prev) => {
              if (prev.some((r) => r.id === next.id)) return prev
              const merged = [...prev, next]
              merged.sort((a, b) => a.floorNo - b.floorNo || a.number.localeCompare(b.number))
              return merged
            })
          } else if (eventType === "UPDATE") {
            const next = mapDbRowToRoom(payload.new as Parameters<typeof mapDbRowToRoom>[0])
            setRooms((prev) => prev.map((r) => (r.id === next.id ? next : r)))
            setSelectedRoom((prev) =>
              prev?.id === next.id ? { ...prev, ...next, beds: next.beds } : prev,
            )
            setEditForm((prev) => {
              if (selectedRoomIdRef.current !== next.id) return prev
              return { ...prev, ...next }
            })
          } else if (eventType === "DELETE") {
            const deletedId = String((payload.old as { id?: unknown })?.id)
            setRooms((prev) => prev.filter((r) => r.id !== deletedId))
            setSelectedRoom((prev) => (prev?.id === deletedId ? null : prev))
            if (selectedRoomIdRef.current === deletedId) {
              setIsSidebarOpen(false)
            }
          }
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [pgId])

  useEffect(() => {
    if (!capacityOptions.includes(filters.capacity)) {
      setFilters((prev) => ({ ...prev, capacity: "All Beds" }))
    }
  }, [capacityOptions, filters.capacity])

  useEffect(() => {
    if (!isSidebarOpen) setOpenDropdown(null)
  }, [isSidebarOpen])

  useEffect(() => {
    if (!isAddDialogOpen) {
      setOpenDropdown((d) => (d === "add-floor" || d === "add-type" ? null : d))
    }
  }, [isAddDialogOpen])

  useEffect(() => {
    if (isAddDialogOpen) {
      setAddForm({
        number: "",
        floorNo: null,
        type: null,
        capacity: "",
        rentAmount: "",
        maintenanceFee: "",
        notes: "",
      })
      setOpenDropdown(null)
    }
  }, [isAddDialogOpen])

  const filteredRooms = useMemo(() => {
    const list = rooms.filter((room) => {
      const matchesSearch = room.number.toLowerCase().includes(search.toLowerCase())

      const matchesFloor = filters.floor === "All Floors" || room.floor === filters.floor
      const matchesType = filters.type === "All Types" || room.type === filters.type
      const matchesStatus =
        filters.status === "All Statuses"
          ? true
          : filters.status === "notice_period"
            ? (tenantsByRoom[room.id]?.some(t => t.status === "notice_period" || t.status === "move_out") || false)
            : room.status === filters.status.toLowerCase()

      const matchesCapacity =
        filters.capacity === "All Beds"
          ? true
          : (() => {
              const n = Number.parseInt(filters.capacity, 10)
              return Number.isFinite(n) && room.capacity === n
            })()

      return matchesSearch && matchesFloor && matchesType && matchesStatus && matchesCapacity
    })

    if (vacantFirst) {
      return [...list].sort((a, b) => {
        const getOrder = (status: string) => {
          if (status === "vacant") return 0
          if (status === "partially occupied") return 1
          if (status === "full") return 2
          return 3 // maintenance
        }
        return getOrder(a.status) - getOrder(b.status)
      })
    }
    return list
  }, [rooms, search, filters, tenantsByRoom, vacantFirst])

  const stats = useMemo(() => {
    return {
      vacant: rooms.filter((r) => r.status === "vacant").length,
      partial: rooms.filter((r) => r.status === "partially occupied").length,
      full: rooms.filter((r) => r.status === "full").length,
      maintenance: rooms.filter((r) => r.status === "maintenance").length,
    }
  }, [rooms])

  const statsById = useMemo(
    () => ({
      vacant: stats.vacant,
      "partially occupied": stats.partial,
      full: stats.full,
      maintenance: stats.maintenance,
      notice_period: rooms.filter(r => tenantsByRoom[r.id]?.some(t => t.status === "notice_period" || t.status === "move_out")).length
    }),
    [stats, rooms, tenantsByRoom],
  )

  const openRoomSheet = useCallback((room: Room) => {
    void Haptics.selectionAsync()
    setSelectedRoom(room)
    setEditForm({ ...room })
    setIsEditing(false)
    setIsSidebarOpen(true)
  }, [])

  const handleEditClick = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setIsEditing(true)
    if (selectedRoom) setEditForm({ ...selectedRoom })
  }, [selectedRoom])

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false)
    if (selectedRoom) setEditForm({ ...selectedRoom })
  }, [selectedRoom])

  const handleSaveEdit = async () => {
    if (!selectedRoom) return
    const cap = typeof editForm.capacity === "number" ? editForm.capacity : selectedRoom.capacity
    if (!Number.isFinite(cap) || cap < 1) {
      Alert.alert("Invalid beds", "Number of beds must be at least 1.")
      return
    }
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
      const updatePayload: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
        status: (editForm.status as Room["status"] | undefined) ?? selectedRoom.status,
      }
      if (typeof editForm.number === "string") updatePayload.room_number = editForm.number
      if (typeof editForm.floorNo === "number") updatePayload.floor_no = editForm.floorNo
      if (editForm.type) updatePayload.room_type = roomTypeToDb(editForm.type as "AC" | "Non-AC")
      if (typeof editForm.capacity === "number") updatePayload.total_beds = editForm.capacity
      if (typeof editForm.rentAmount === "number") updatePayload.rent_amount = editForm.rentAmount
      if (typeof editForm.maintenanceFee === "number")
        updatePayload.maintenance = editForm.maintenanceFee
      if (typeof editForm.notes === "string") updatePayload.notes = editForm.notes

      const { error } = await supabase
        .from("rooms_table")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update(updatePayload as any)
        .eq("id", Number(selectedRoom.id))

      if (error) {
        console.error(error)
        return
      }
      await fetchData()
      setIsEditing(false)
      setIsSidebarOpen(false)
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    } catch (err) {
      console.error(err)
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
    }
  }

  const handleResolveMaintenance = async () => {
    if (!selectedRoom) return
    try {
      const { error } = await supabase
        .from("rooms_table")
        .update({ status: "vacant", updated_at: new Date().toISOString() })
        .eq("id", Number(selectedRoom.id))
      if (error) return
      setSelectedRoom((prev) => (prev ? { ...prev, status: "vacant" } : prev))
      setEditForm((prev) => ({ ...prev, status: "vacant" }))
      await fetchData()
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    } catch (_) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
    }
  }

  const handleMoveToMaintenance = async () => {
    if (!selectedRoom) return
    if (selectedRoom.status === "maintenance") return
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
      const { error } = await supabase
        .from("rooms_table")
        .update({ status: "maintenance", updated_at: new Date().toISOString() })
        .eq("id", Number(selectedRoom.id))
      if (error) {
        console.error(error)
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
        return
      }
      setSelectedRoom((prev) => (prev ? { ...prev, status: "maintenance" } : prev))
      setEditForm((prev) => ({ ...prev, status: "maintenance" }))
      await fetchData()
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    } catch (_) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
    }
  }

  const handleDeleteRoom = async () => {
    if (!selectedRoom) return
    
    // Check if room is empty
    if (selectedRoom.occupiedBeds > 0) {
      Alert.alert(
        "Cannot Delete Room",
        "This room has tenants assigned to it. Please move or remove all tenants before deleting the room.",
        [{ text: "OK" }]
      )
      return
    }

    // Show confirmation modal
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    setDeleteConfirmVisible(true)
  }

  const confirmDeleteRoom = async () => {
    if (!selectedRoom) return
    
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
      const { error } = await supabase
        .from("rooms_table")
        .delete()
        .eq("id", Number(selectedRoom.id))
      
      if (error) {
        console.error(error)
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
        Alert.alert("Error", "Failed to delete the room. Please try again.")
        return
      }
      
      // Close modals and refresh data
      setDeleteConfirmVisible(false)
      setIsSidebarOpen(false)
      setSelectedRoom(null)
      await fetchData()
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    } catch (err) {
      console.error(err)
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      Alert.alert("Error", "An unexpected error occurred while deleting the room.")
    }
  }

  const handleAddRoom = async () => {
    if (!pgId) return
    const num = addForm.number.trim()
    if (!num) {
      Alert.alert("Missing information", "Please enter a room number.")
      return
    }
    if (addForm.floorNo === null) {
      Alert.alert("Missing information", "Please select a floor.")
      return
    }
    if (!addForm.type) {
      Alert.alert("Missing information", "Please select room type.")
      return
    }
    const beds = Number.parseInt(addForm.capacity, 10)
    if (!Number.isFinite(beds) || beds < 1) {
      Alert.alert("Invalid beds", "Number of beds must be at least 1.")
      return
    }
    const rent = Number.parseInt(addForm.rentAmount, 10)
    if (!Number.isFinite(rent) || rent <= 0) {
      Alert.alert("Missing information", "Please enter monthly rent.")
      return
    }
    const maintRaw = addForm.maintenanceFee.trim()
    if (maintRaw === "") {
      Alert.alert("Missing information", "Please enter maintenance amount (use 0 if none).")
      return
    }
    const maint = Number.parseInt(maintRaw, 10)
    if (!Number.isFinite(maint) || maint < 0) {
      Alert.alert("Invalid amount", "Maintenance must be a valid number (0 or more).")
      return
    }

    setIsAdding(true)
    try {
      const { error } = await supabase.from("rooms_table").insert({
        pg_id: pgId,
        room_number: num,
        floor_no: addForm.floorNo,
        room_type: roomTypeToDb(addForm.type) as "ac" | "non-ac",
        total_beds: beds,
        rent_amount: rent,
        maintenance: maint,
        notes: addForm.notes || "",
        status: "vacant",
        occupied_beds: 0,
      })
      if (error) {
        console.error(error)
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
        return
      }
      setIsAddDialogOpen(false)
      setAddForm({
        number: "",
        floorNo: null,
        type: null,
        capacity: "",
        rentAmount: "",
        maintenanceFee: "",
        notes: "",
      })
      await fetchData()
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    } catch (_) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
    }
    setIsAdding(false)
  }

  const handleAddFloorInDetails = async () => {
    if (!pgId) return
    const newNoFloors = noFloors + 1
    const { error } = await supabase
      .from("pg_details")
      .update({ no_floors: newNoFloors, updated_at: new Date().toISOString() })
      .eq("id", pgId)
    if (error) {
      console.error(error)
      return
    }
    setNoFloors(newNoFloors)
    setAddForm((prev) => ({ ...prev, floorNo: newNoFloors }))
  }

  const loadingFirst = isLoading && !hasLoadedOnce

  const listHeader = (
    <>
      <View className="mt-1.5 flex-row items-center justify-between gap-4">
        <View className="flex-1 pr-2">
          <Text className="text-2xl font-black text-foreground dark:text-foreground-dark tracking-tight">Rooms</Text>
          <Text className="text-xs text-muted dark:text-muted-dark font-medium mt-0.5">Manage rooms and occupancy.</Text>
        </View>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Add room"
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
            setIsAddDialogOpen(true)
          }}
          className="h-10 w-10 rounded-xl items-center justify-center shadow-lg"
          style={{
            backgroundColor: primaryColor,
            shadowColor: primaryColor,
            shadowOpacity: 0.25,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 4 },
          }}
        >
          <Plus size={20} color="#ffffff" />
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-1 mt-1.5 pb-1.5">
        <View className="flex-row gap-2 px-1">
          {STAT_CHIPS.map((stat) => {
            const active = filters.status === stat.id
            return (
              <TouchableOpacity
                key={`${stat.id}-${active}`}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => {
                  void Haptics.selectionAsync()
                  setFilters((prev) => ({
                    ...prev,
                    status: prev.status === stat.id ? "All Statuses" : stat.id,
                  }))
                }}
                className={clsx(
                  "shrink-0 flex-row items-center gap-1.5 rounded-full border px-3 py-1.5",
                  stat.text,
                  stat.border,
                  active ? stat.bg : "bg-white dark:bg-slate-900",
                )}
                style={
                  active
                    ? {
                        borderWidth: 2,
                        borderColor: stat.color,
                        shadowColor: stat.color,
                        shadowOffset: { width: 0, height: 0 },
                        shadowOpacity: 0.55,
                        shadowRadius: 10,
                        elevation: 8,
                      }
                    : { borderWidth: 1 }
                }
              >
                <Text className={clsx("text-xs font-medium", stat.text, active ? "font-semibold" : "")}>
                  {stat.label}
                </Text>
                {isLoading ? (
                  <View className="h-4 w-6 bg-slate-200/50 dark:bg-slate-800/35 rounded-full items-center justify-center" />
                ) : (
                  <Text
                    className={clsx(
                      "rounded-full px-1.5 py-0.5 text-[10px] font-bold bg-black/10 dark:bg-white/10",
                      stat.text,
                    )}
                  >
                    {statsById[stat.id]}
                  </Text>
                )}
              </TouchableOpacity>
            )
          })}
        </View>
      </ScrollView>

      <View className="mb-2 mt-1">
        <View className="flex-row items-center gap-2">
          <View className="relative flex-1">
            <View className="pointer-events-none absolute left-3 top-1/2 z-10 mt-[-8px]">
              <Search size={16} color="#94a3b8" />
            </View>
            <TextInput
              placeholder="Search room number..."
              placeholderTextColor="#94a3b8"
              value={search}
              onChangeText={setSearch}
              autoCorrect={false}
              clearButtonMode="while-editing"
              className="h-9 rounded-xl border border-border dark:border-border-dark bg-card dark:bg-card-dark pl-9 pr-3 text-xs text-foreground dark:text-foreground-dark"
            />
          </View>
          <TouchableOpacity
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
              setVacantFirst(prev => !prev)
            }}
            className={clsx(
              "h-9 px-3 rounded-xl border items-center justify-center flex-row gap-1.5",
              vacantFirst 
                ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-300 dark:border-emerald-500/40" 
                : "bg-card dark:bg-card-dark border-border dark:border-border-dark"
            )}
          >
            <ArrowUpDown size={12} color={vacantFirst ? "#10b981" : "#94a3b8"} />
            <Text 
              className={clsx(
                "text-[10px] font-bold",
                vacantFirst ? "text-emerald-600 dark:text-emerald-400" : "text-slate-500 dark:text-slate-400"
              )}
            >
              Vacant First
            </Text>
          </TouchableOpacity>
          {hasActiveFilters && (
            <TouchableOpacity
              onPress={() => {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
                setFilters({
                  floor: "All Floors",
                  type: "All Types",
                  status: filters.status,
                  capacity: "All Beds",
                })
              }}
              activeOpacity={0.8}
              className="h-9 w-9 items-center justify-center rounded-xl bg-card dark:bg-card-dark border border-border dark:border-border-dark active:scale-95"
            >
              <X size={18} color={isDark ? "#e2e8f0" : "#64748b"} />
            </TouchableOpacity>
          )}
        </View>
        <View className="mt-1.5 flex-row gap-2">
          <InlineSelect
            key={`filter-floor-${filters.floor}-${openDropdown === "filter-floor"}`}
            options={floorFilterOptions}
            value={filters.floor}
            defaultTriggerLabel="Floor"
            isActive={filters.floor !== "All Floors"}
            primaryColor={primaryColor}
            isDark={isDark}
            overlay
            keyboardHeight={keyboardHeight}
            open={openDropdown === "filter-floor"}
            onOpenChange={(o) => {
              void Haptics.selectionAsync()
              setOpenDropdown(o ? "filter-floor" : null)
            }}
            onChange={(v) => setFilters((p) => ({ ...p, floor: p.floor === v ? "All Floors" : v }))}
          />
          <InlineSelect
            key={`filter-type-${filters.type}-${openDropdown === "filter-type"}`}
            options={typeFilterOptions}
            value={filters.type}
            defaultTriggerLabel="Type"
            isActive={filters.type !== "All Types"}
            primaryColor={primaryColor}
            isDark={isDark}
            overlay
            keyboardHeight={keyboardHeight}
            open={openDropdown === "filter-type"}
            onOpenChange={(o) => {
              void Haptics.selectionAsync()
              setOpenDropdown(o ? "filter-type" : null)
            }}
            onChange={(v) => setFilters((p) => ({ ...p, type: p.type === v ? "All Types" : v }))}
          />
          <InlineSelect
            key={`filter-capacity-${filters.capacity}-${openDropdown === "filter-capacity"}`}
            options={capacityFilterOptions}
            value={filters.capacity}
            defaultTriggerLabel="Beds"
            isActive={filters.capacity !== "All Beds"}
            primaryColor={primaryColor}
            isDark={isDark}
            overlay
            keyboardHeight={keyboardHeight}
            open={openDropdown === "filter-capacity"}
            onOpenChange={(o) => {
              void Haptics.selectionAsync()
              setOpenDropdown(o ? "filter-capacity" : null)
            }}
            onChange={(v) => setFilters((p) => ({ ...p, capacity: p.capacity === v ? "All Beds" : v }))}
          />
        </View>
      </View>

      {loadingFirst ? (
        <View className="gap-3 pb-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <View key={i} className="h-20 rounded-2xl bg-slate-100 dark:bg-slate-900" />
          ))}
        </View>
      ) : null}

            {!loadingFirst && isRefreshing ? (
            <View className="mb-2 flex-row items-center gap-2 px-1">
              <ActivityIndicator size="small" color={isDark ? "#94a3b8" : "#64748b"} />
              <Text className="text-xs text-slate-500 dark:text-slate-400">Refreshing rooms…</Text>
            </View>
          ) : null}

      {!loadingFirst && pgMissing ? (
        <View className="mb-20 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <Text className="text-lg font-semibold text-slate-900 dark:text-white">Complete onboarding to manage rooms</Text>
          <Text className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            We couldn&apos;t find your PG details. Complete onboarding first, then you can add rooms.
          </Text>
          <TouchableOpacity onPress={() => router.push("/onboarding")} className="mt-5 h-12 items-center justify-center rounded-xl px-6" style={{ backgroundColor: primaryColor }}>
            <Text className="font-bold text-white">Go to onboarding</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {!loadingFirst && pageError ? (
        <View className="mb-16 rounded-2xl border border-rose-200/75 bg-white p-6 shadow-sm dark:border-rose-900/60 dark:bg-slate-950">
          <Text className="text-base font-semibold text-rose-600 dark:text-rose-400">Couldn&apos;t load rooms</Text>
          <Text className="mt-2 text-sm text-slate-500 dark:text-slate-400">{pageError}</Text>
          <TouchableOpacity onPress={() => void fetchData()} className="mt-4 h-10 items-center justify-center rounded-xl border border-slate-200 px-6 dark:border-slate-800">
            <Text className="font-semibold text-slate-800 dark:text-slate-50">Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {!loadingFirst && !pgMissing && !pageError ? (
        <View className="mb-2 flex-row rounded-md px-1">
          <Text className="min-w-0 flex-1 pr-4 text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
            Room
          </Text>
          {!compactRent ? (
            <Text className="w-[94px] text-right text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
              Rent / Mo
            </Text>
          ) : null}
          <Text className="w-[116px] text-right text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
            Status
          </Text>
        </View>
      ) : null}
    </>
  )

  const listEmpty =
    !loadingFirst && !pgMissing && !pageError ? (
      <View className="mb-32 items-center rounded-3xl border border-dashed border-slate-200 bg-white py-14 dark:border-slate-700 dark:bg-slate-950/85">
        <View className="mb-5 h-16 w-16 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
          <Search size={32} color="#94a3b8" />
        </View>
        <Text className="text-lg font-semibold text-slate-900 dark:text-white">No rooms found</Text>
        <Text className="mx-8 mt-2 text-center text-sm text-slate-500 dark:text-slate-400">
          Adjust your filters or search criteria to continue.
        </Text>
        <TouchableOpacity
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
            setFilters({
              floor: "All Floors",
              type: "All Types",
              status: "All Statuses",
              capacity: "All Beds",
            })
            setSearch("")
          }}
          activeOpacity={0.88}
          className="mt-8 rounded-xl border border-slate-200 px-6 py-2.5 dark:border-slate-800"
        >
          <Text className="font-semibold text-slate-800 dark:text-slate-200">Clear all filters</Text>
        </TouchableOpacity>
      </View>
    ) : null

  const renderDetailSheet = selectedRoom ? (
    <Modal
      visible={isSidebarOpen && !!selectedRoom}
      transparent
      animationType="none"
      onRequestClose={() => setIsSidebarOpen(false)}
    >
      <View className="flex-1 flex-row-reverse bg-black/45">
        <Pressable className="w-[min(92px,12%)]" onPress={() => setIsSidebarOpen(false)} />

        <KeyboardAvoidingView
          behavior="padding"
          keyboardVerticalOffset={0}
          style={{ width: Math.min(width * 0.9, 420), flex: 1 }}
          className="border-l border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"
        >
          <View style={{ paddingTop: insets.top + 4 }} className="relative flex-shrink-0 border-b border-slate-100 px-5 pb-3 dark:border-slate-900">
            <TouchableOpacity onPress={() => setIsSidebarOpen(false)} accessibilityLabel="Close room details" className="absolute right-4 z-10 h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950" style={{ top: (insets.top || 32) + 2 }}>
              <X size={20} color="#94a3b8" />
            </TouchableOpacity>
            <LinearGradient colors={[`${primaryColor}12`, `${primaryColor}04`, "transparent"]} style={StyleSheet.absoluteFillObject} pointerEvents="none" />
            <View className="flex-row flex-wrap items-start justify-between gap-3 pr-12 pt-1">
              <View className="min-w-0 flex-1">
                <View className="flex-row flex-wrap items-center gap-3">
                  <LinearGradient
                    colors={[`${primaryColor}22`, `${primaryColor}06`]}
                    style={{
                      alignItems: "center",
                      justifyContent: "center",
                      height: 44,
                      width: 44,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: isDark ? "rgba(0,145,255,0.4)" : "rgba(0,113,223,0.32)",
                    }}
                  >
                    <DoorOpen size={21} color={primaryColor} />
                  </LinearGradient>
                  <Text
                    numberOfLines={2}
                    className="min-w-[40%] flex-shrink text-[24px] font-black tracking-tight text-slate-900 dark:text-slate-50"
                  >
                    Room {selectedRoom.number}
                  </Text>
                </View>
                <Text className="mt-1.5 text-sm font-semibold text-slate-500 dark:text-slate-400">
                  {selectedRoom.floor} • {selectedRoom.type === "Non-AC" ? "NON AC" : selectedRoom.type}
                </Text>
              </View>
              {!isEditing ? (
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Edit room" onPress={handleEditClick} activeOpacity={0.9} className="flex-row items-center gap-2 rounded-xl border border-slate-200 bg-white/95 px-4 py-2.5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                  <Pencil size={16} color={isDark ? "#e5e7eb" : "#1f2937"} />
                  <Text className="text-sm font-bold text-slate-900 dark:text-slate-100">Edit</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          <KeyboardAwareScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="always"
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: insets.bottom + 24 }}
            className="flex-1 bg-white dark:bg-slate-950"
          >
            <View className="flex-row gap-3">
              <View className="flex-1 rounded-xl border border-slate-100 bg-slate-50 px-3 py-3 dark:border-slate-800 dark:bg-slate-900">
                <Text className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Current Status
                </Text>
                <Text
                  className={clsx(
                    "self-start rounded-lg border px-2.5 py-1 text-[11px] font-bold",
                    getStatusConfig(selectedRoom.status).badge,
                  )}
                >
                  {getStatusConfig(selectedRoom.status).label}
                </Text>
              </View>
              <View className="flex-1 justify-center rounded-xl border border-slate-100 bg-slate-50 px-3 py-3 dark:border-slate-800 dark:bg-slate-900">
                <Text className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Rent / Mo
                </Text>
                <Text className="text-lg font-black tracking-tight text-slate-900 dark:text-slate-50">
                  ₹{selectedRoom.rentAmount.toLocaleString()}
                </Text>
              </View>
            </View>

            <View className="mt-4">
              <View className="mb-2 flex-row items-center gap-2 border-l-[4px] border-primary pl-2">
                <Info size={15} color={primaryColor} />
                <Text className="text-[12px] font-black uppercase text-slate-900 dark:text-slate-200">Room information</Text>
              </View>
              <View className="gap-3 rounded-xl border border-slate-100 bg-white px-3 py-4 dark:border-slate-800 dark:bg-slate-950">
                <View className="flex-row gap-3" style={{ zIndex: openDropdown === "detail-floor" ? 100 : 1, position: "relative" }}>
                  <View className="min-w-0 flex-1">
                    <RoomFieldRow
                      label="Room Number"
                      isEditing={isEditing}
                      displayValue={selectedRoom.number}
                      editable={
                        <TextInput
                          value={typeof editForm.number === "string" ? editForm.number : selectedRoom.number}
                          onChangeText={(v) => setEditForm((p) => ({ ...p, number: v }))}
                          placeholder="e.g. 101"
                          placeholderTextColor="#94a3b8"
                          className="h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 text-[13px] font-semibold text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                        />
                      }
                    />
                  </View>
                  <View className="min-w-0 flex-1" style={{ overflow: "visible" }}>
                    <RoomFieldRow
                      label="Floor"
                      isEditing={isEditing}
                      displayValue={selectedRoom.floor}
                      editable={
                        <InlineSelect
                          options={addFloorOptions}
                          value={String(editForm.floorNo ?? selectedRoom.floorNo)}
                          defaultTriggerLabel="Floor"
                          onChange={(v) => {
                            const floor = availableFloors.find((f) => String(f.value) === v)
                            if (floor) {
                              setEditForm((p) => ({
                                ...p,
                                floorNo: floor.value,
                                floor: floor.label,
                              }))
                            }
                          }}
                          primaryColor={primaryColor}
                          isDark={isDark}
                          className="flex-none w-full"
                          open={openDropdown === "detail-floor"}
                          onOpenChange={(o) => setOpenDropdown(o ? "detail-floor" : null)}
                        />
                      }
                    />
                  </View>
                </View>
                <View className="flex-row gap-3" style={{ zIndex: openDropdown === "detail-type" ? 90 : 1, position: "relative" }}>
                  <View className="min-w-0 flex-1" style={{ overflow: "visible" }}>
                    <RoomFieldRow
                      label="Room Type"
                      isEditing={isEditing}
                      displayValue={selectedRoom.type === "Non-AC" ? "NON AC" : selectedRoom.type}
                      editable={
                        <InlineSelect
                          options={[
                            { value: "AC", shortLabel: "AC" },
                            { value: "Non-AC", shortLabel: "NON AC" },
                          ]}
                          value={editForm.type ?? selectedRoom.type}
                          defaultTriggerLabel="Type"
                          onChange={(v) => setEditForm((p) => ({ ...p, type: v as "AC" | "Non-AC" }))}
                          primaryColor={primaryColor}
                          isDark={isDark}
                          className="flex-none w-full"
                          open={openDropdown === "detail-type"}
                          onOpenChange={(o) => setOpenDropdown(o ? "detail-type" : null)}
                        />
                      }
                    />
                  </View>
                  <View className="min-w-0 flex-1">
                    <RoomFieldRow
                      label="NO OF BEDS"
                      isEditing={isEditing}
                      displayValue={`${selectedRoom.capacity} Beds`}
                      editable={
                        <TextInput
                          keyboardType="number-pad"
                          value={String(editForm.capacity ?? selectedRoom.capacity)}
                          onChangeText={(v) => {
                            const d = v.replace(/[^\d]/g, "")
                            if (d === "") return
                            const n = Number.parseInt(d, 10)
                            if (!Number.isFinite(n) || n < 1) return
                            setEditForm((p) => ({ ...p, capacity: n }))
                          }}
                          className="h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 text-[13px] font-semibold text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                        />
                      }
                    />
                  </View>
                </View>
                <View className="flex-row gap-3">
                  <View className="min-w-0 flex-1">
                    <RoomFieldRow
                      label="Monthly Rent"
                      isEditing={isEditing}
                      displayValue={`₹${selectedRoom.rentAmount.toLocaleString()}`}
                      editable={
                        <TextInput
                          keyboardType="number-pad"
                          value={String(editForm.rentAmount ?? selectedRoom.rentAmount)}
                          onChangeText={(v) =>
                            setEditForm((p) => ({ ...p, rentAmount: Number.parseInt(v, 10) || 0 }))
                          }
                          className="h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 text-[13px] font-semibold text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                        />
                      }
                    />
                  </View>
                  <View className="min-w-0 flex-1">
                    <RoomFieldRow
                      label="Maintenance Fee"
                      isEditing={isEditing}
                      displayValue={`₹${selectedRoom.maintenanceFee.toLocaleString()}`}
                      editable={
                        <TextInput
                          keyboardType="number-pad"
                          value={String(editForm.maintenanceFee ?? selectedRoom.maintenanceFee)}
                          onChangeText={(v) =>
                            setEditForm((p) => ({
                              ...p,
                              maintenanceFee: Number.parseInt(v, 10) || 0,
                            }))
                          }
                          className="h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 text-[13px] font-semibold text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                        />
                      }
                    />
                  </View>
                </View>
              </View>
            </View>

            <View className="mt-5">
              <View className="mb-2 flex-row items-center gap-2 border-l-[4px] border-primary pl-2">
                <Bed size={15} color={primaryColor} />
                <Text className="text-[12px] font-black uppercase tracking-wide text-slate-900 dark:text-slate-200">
                  Bed allocation
                </Text>
              </View>
              {Array.from({ length: selectedRoom.capacity }, (_, idx) => {
                const tenant = (tenantsByRoom[selectedRoom.id] || [])[idx] ?? null
                const bedLabel = `Bed ${String.fromCharCode(65 + idx)}`
                return (
                  <View
                    key={idx}
                    className="mb-2 flex-row items-center justify-between rounded-xl border border-slate-100 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
                  >
                    <View className="min-w-0 flex-1 flex-row items-center gap-3">
                      <View
                        className={clsx(
                          "h-10 w-10 items-center justify-center rounded-lg border",
                          tenant
                            ? "border-primary/35 bg-primary/6"
                            : "border border-dashed border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800",
                        )}
                      >
                        <Bed size={18} color={tenant ? primaryColor : "#94a3b8"} />
                      </View>
                      <View className="min-w-0 flex-1">
                        <View className="flex-row items-center flex-wrap gap-1.5">
                          <Text
                            numberOfLines={1}
                            ellipsizeMode="tail"
                            className={clsx(
                              "text-[13px] font-bold tracking-tight",
                              tenant ? "text-slate-900 dark:text-slate-100" : "italic text-slate-400 dark:text-slate-500",
                            )}
                          >
                            {tenant ? tenant.name : "Vacant"}
                          </Text>
                          {tenant && (tenant.status === "notice_period" || tenant.status === "move_out") && (
                            <View className="px-1.5 py-0.5 rounded bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-900/40">
                              <Text className="text-[8px] font-black uppercase text-purple-600 dark:text-purple-400">Notice</Text>
                            </View>
                          )}
                        </View>
                        <View className="flex-row items-center justify-between mt-0.5">
                          <Text className="text-[11px] text-slate-400 dark:text-slate-500">{bedLabel}</Text>
                          {tenant && (tenant.status === "notice_period" || tenant.status === "move_out") && tenant.exitDate && (
                            <Text className="text-[10px] font-semibold text-purple-600 dark:text-purple-400">
                              Out: {new Date(tenant.exitDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                            </Text>
                          )}
                        </View>
                      </View>
                    </View>
                    {tenant ? (
                      <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel="Tenant quick view"
                        onPress={() => {
                          void Haptics.selectionAsync()
                          setPreviewTenant(tenant)
                        }}
                        hitSlop={10}
                        className="rounded-xl px-2 py-2"
                      >
                        <Text style={{ color: primaryColor }} className="text-xs font-bold">
                          View
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                )
              })}
            </View>

            <View className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-900">
              <View className="mb-2 flex-row items-center gap-2 border-l-[4px] border-primary pl-2">
                <History size={15} color={primaryColor} />
                <Text className="text-[12px] font-black uppercase tracking-wide text-slate-900 dark:text-slate-200">
                  Room notes
                  {isEditing ? (
                    <Text className="text-[11px] font-semibold normal-case text-slate-400"> (optional)</Text>
                  ) : null}
                </Text>
              </View>
              {isEditing ? (
                <TextInput
                  ref={editNotesRef.ref}
                  multiline
                  numberOfLines={4}
                  value={typeof editForm.notes === "string" ? editForm.notes : selectedRoom.notes}
                  placeholder="Write special notes or instructions..."
                  placeholderTextColor="#94a3b8"
                  onFocus={editNotesRef.onFocus}
                  onChangeText={(v) => setEditForm((p) => ({ ...p, notes: v }))}
                  className="min-h-[88px] rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-50"
                  textAlignVertical="top"
                  style={{
                    ...(Platform.OS === "android"
                      ? { paddingVertical: 10 }
                      : {}),
                  }}
                />
              ) : (
                <View className="min-h-[72px] flex-col justify-center rounded-xl border border-slate-100 bg-slate-50 px-3 py-3 dark:border-slate-800 dark:bg-slate-900">
                  <Text className="text-sm italic leading-snug text-slate-600 dark:text-slate-400">
                    {selectedRoom.notes.trim() !== "" ? selectedRoom.notes : "No notes added for this room yet."}
                  </Text>
                </View>
              )}
              {!isEditing ? (
                <View className="mt-4 gap-2">
                  {selectedRoom.status === "maintenance" ? (
                    <TouchableOpacity
                      accessibilityRole="button"
                      onPress={() => void handleResolveMaintenance()}
                      className="flex-row items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 py-3.5 dark:border-emerald-900 dark:bg-emerald-950/40"
                    >
                      <CheckCircle2 size={18} color="#10b981" />
                      <Text className="text-sm font-bold text-emerald-700 dark:text-emerald-400">Resolve maintenance</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      accessibilityRole="button"
                      onPress={() => void handleMoveToMaintenance()}
                      activeOpacity={0.9}
                      className="flex-row items-center justify-center gap-2 rounded-xl border border-orange-200 bg-orange-50 py-3.5 dark:border-orange-900 dark:bg-orange-950/35"
                    >
                      <Wrench size={18} color="#f97316" />
                      <Text className="text-sm font-bold text-orange-800 dark:text-orange-300">Move to Maintenance</Text>
                    </TouchableOpacity>
                  )}
                  {/* Delete button - only show for empty rooms */}
                  {selectedRoom.occupiedBeds === 0 ? (
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel="Delete room"
                      onPress={() => void handleDeleteRoom()}
                      activeOpacity={0.9}
                      className="flex-row items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 py-3.5 dark:border-red-900 dark:bg-red-950/35"
                    >
                      <Trash2 size={18} color="#ef4444" />
                      <Text className="text-sm font-bold text-red-700 dark:text-red-400">Delete Room</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : null}
            </View>
          </KeyboardAwareScrollView>

          {isEditing ? (
            <View
              style={{ paddingBottom: Math.max(insets.bottom + 14, 20) }}
              className="border-t border-slate-100 bg-white px-6 py-5 dark:border-slate-900 dark:bg-slate-950"
            >
              <View className="flex-row gap-4">
                <TouchableOpacity
                  accessibilityRole="button"
                  onPress={handleCancelEdit}
                  className="flex-1 items-center justify-center rounded-xl border border-slate-200 py-[14px] dark:border-slate-800 dark:bg-black/15"
                >
                  <Text className="font-bold text-slate-800 dark:text-slate-300">Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityRole="button"
                  onPress={() => void handleSaveEdit()}
                  className="flex-1 items-center justify-center rounded-xl py-[14px]"
                  activeOpacity={0.92}
                  style={{
                    ...(isDark
                      ? { backgroundColor: primaryColor }
                      : { backgroundColor: primaryColor }),
                    shadowColor: primaryColor,
                    shadowOffset: { width: 0, height: 6 },
                    shadowOpacity: isDark ? 0.52 : 0.42,
                    shadowRadius: 10,
                  }}
                >
                  <Text className="font-bold text-white shadow-sm">Save Changes</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
        </KeyboardAvoidingView>
      </View>
    </Modal>
  ) : null

  return (
    <SafeAreaView
      edges={["top"]}
      className="flex-1 bg-background dark:bg-background-dark"
      style={colorScheme === "dark" ? { backgroundColor: "#0f111a" } : { backgroundColor: "#fafafa" }}
    >
      <FlatList
        data={loadingFirst || pgMissing || pageError ? [] : filteredRooms}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="always"
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={Platform.OS === "android"}
        extraData={[
          isRefreshing,
          isSidebarOpen,
          selectedRoom?.id,
          filters,
          search,
          compactRent,
          openDropdown,
        ]}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing && !isLoading && hasLoadedOnce}
            onRefresh={() => void fetchData()}
            tintColor={primaryColor}
          />
        }
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          !loadingFirst && !pgMissing && !pageError && filteredRooms.length === 0 ? listEmpty : null
        }
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 16,
          paddingBottom: insets.bottom + 110,
        }}
        renderItem={({ item }) => (
          <RoomRowCard
            room={item}
            selected={selectedRoom?.id === item.id && isSidebarOpen}
            isDark={isDark}
            compactRent={compactRent}
            primaryColor={primaryColor}
            onPress={() => openRoomSheet(item)}
          />
        )}
      />

      <Modal visible={isAddDialogOpen} animationType="none" transparent onRequestClose={() => setIsAddDialogOpen(false)}>
        <View className="flex-1 justify-end">
          <Pressable
            className="absolute bottom-0 left-0 right-0 top-0 bg-black/55"
            onPress={() => {
              setOpenDropdown(null)
              setIsAddDialogOpen(false)
            }}
          />
          <KeyboardAvoidingView
            behavior="padding"
            keyboardVerticalOffset={0}
            className="w-full bg-white dark:bg-slate-950 rounded-t-[26px] border border-slate-200 dark:border-slate-800 overflow-hidden"
          >
            {(() => {
              const sheetMax = Math.min(
                height * 0.92,
                keyboardHeight > 0 ? height - keyboardHeight - insets.top : height * 0.92,
              )
              const scrollMax = Math.max(180, sheetMax - 148)
              return (
                <View
                  style={{ maxHeight: sheetMax }}
                >
                  <View className="flex-row items-center justify-between border-b border-slate-100 px-5 py-3 dark:border-slate-800">
                    <View className="flex-row items-center gap-2">
                      <DoorOpen size={20} color={primaryColor} />
                      <Text className="text-lg font-bold text-slate-900 dark:text-slate-50">Add New Room</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => setIsAddDialogOpen(false)}
                      className="h-10 w-10 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-900"
                    >
                      <X size={18} color="#94a3b8" />
                    </TouchableOpacity>
                  </View>
                  <KeyboardAwareScrollView
                    keyboardShouldPersistTaps="always"
                    showsVerticalScrollIndicator={false}
                    disableKeyboardPadding={true}
                    style={{ maxHeight: scrollMax }}
                    contentContainerStyle={{
                      paddingHorizontal: 20,
                      paddingTop: 12,
                      paddingBottom: 16,
                      gap: 12,
                    }}
                  >
                    <View className="flex-row gap-3" style={{ zIndex: openDropdown === "add-floor" ? 100 : 1, position: "relative" }}>
                      <View className="flex-1">
                        <Text className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          Room Number
                        </Text>
                        <TextInput
                          ref={addRoomNumberRef.ref}
                          onFocus={addRoomNumberRef.onFocus}
                          value={addForm.number}
                          onChangeText={(v) => setAddForm((p) => ({ ...p, number: v }))}
                          placeholder="e.g. 101"
                          placeholderTextColor="#94a3b8"
                          className="h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 text-[14px] text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                        />
                      </View>
                      <View className="flex-1" style={{ overflow: "visible" }}>
                        <Text className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">Floor</Text>
                        <InlineSelect
                          options={addFloorOptions}
                          value={addForm.floorNo !== null ? String(addForm.floorNo) : ""}
                          defaultTriggerLabel="Select floor"
                          accent="neutral"
                          isActive={addForm.floorNo !== null}
                          onChange={(v) => {
                            const n = Number.parseInt(v, 10)
                            if (Number.isFinite(n)) setAddForm((p) => ({ ...p, floorNo: n }))
                          }}
                          primaryColor={primaryColor}
                          isDark={isDark}
                          className="flex-none w-full"
                          open={openDropdown === "add-floor"}
                          onOpenChange={(o) => setOpenDropdown(o ? "add-floor" : null)}
                          footer={
                            <TouchableOpacity
                              onPress={() => {
                                void handleAddFloorInDetails()
                                setOpenDropdown(null)
                              }}
                              className="flex-row items-center justify-center gap-2 border-t border-slate-100 py-4 dark:border-slate-800"
                              style={{ backgroundColor: `${primaryColor}12` }}
                            >
                              <Plus size={16} color={primaryColor} />
                              <Text style={{ color: primaryColor }} className="text-sm font-bold">
                                Add New Floor
                              </Text>
                            </TouchableOpacity>
                          }
                        />
                      </View>
                    </View>
                    <View className="flex-row gap-3" style={{ zIndex: openDropdown === "add-type" ? 90 : 1, position: "relative" }}>
                      <View className="flex-1" style={{ overflow: "visible" }}>
                        <Text className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">Room Type</Text>
                        <InlineSelect
                          options={[
                            { value: "AC", shortLabel: "AC" },
                            { value: "Non-AC", shortLabel: "NON AC" },
                          ]}
                          value={addForm.type ? addForm.type : ""}
                          defaultTriggerLabel="Select type"
                          accent="neutral"
                          isActive={addForm.type !== null}
                          onChange={(v) => setAddForm((p) => ({ ...p, type: v as "AC" | "Non-AC" }))}
                          primaryColor={primaryColor}
                          isDark={isDark}
                          className="flex-none w-full"
                          open={openDropdown === "add-type"}
                          onOpenChange={(o) => setOpenDropdown(o ? "add-type" : null)}
                        />
                      </View>
                      <View className="flex-1">
                        <Text className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">NO OF BEDS</Text>
                        <TextInput
                          ref={addRoomCapacityRef.ref}
                          onFocus={addRoomCapacityRef.onFocus}
                          keyboardType="number-pad"
                          value={addForm.capacity}
                          onChangeText={(v) => {
                            const d = v.replace(/[^\d]/g, "")
                            if (d === "0") return
                            setAddForm((p) => ({ ...p, capacity: d }))
                          }}
                          placeholder="e.g. 2"
                          placeholderTextColor="#94a3b8"
                          className="h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 text-[14px] text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                        />
                      </View>
                    </View>
                    <View className="flex-row gap-3">
                      <View className="flex-1">
                        <Text className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">Rent (₹)</Text>
                        <TextInput
                          ref={addRoomRentRef.ref}
                          onFocus={addRoomRentRef.onFocus}
                          keyboardType="number-pad"
                          value={addForm.rentAmount}
                          onChangeText={(v) =>
                            setAddForm((p) => ({ ...p, rentAmount: v.replace(/[^\d]/g, "") }))
                          }
                          placeholder="e.g. 12000"
                          placeholderTextColor="#94a3b8"
                          className="h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 text-[14px] font-semibold text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                        />
                      </View>
                      <View className="flex-1">
                        <Text className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          Maintenance (₹)
                        </Text>
                        <TextInput
                          ref={addRoomMaintRef.ref}
                          onFocus={addRoomMaintRef.onFocus}
                          keyboardType="number-pad"
                          value={addForm.maintenanceFee}
                          onChangeText={(v) =>
                            setAddForm((p) => ({ ...p, maintenanceFee: v.replace(/[^\d]/g, "") }))
                          }
                          placeholder="0 if none"
                          placeholderTextColor="#94a3b8"
                          className="h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 text-[14px] font-semibold text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                        />
                      </View>
                    </View>
                    <View>
                      <Text className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        Room Notes <Text className="font-semibold normal-case text-slate-400">(optional)</Text>
                      </Text>
                      <TextInput
                        ref={addRoomNotesRef.ref}
                        onFocus={addRoomNotesRef.onFocus}
                        multiline
                        value={addForm.notes}
                        onChangeText={(v) => setAddForm((p) => ({ ...p, notes: v }))}
                        placeholder="Special notes or instructions..."
                        placeholderTextColor="#94a3b8"
                        className="min-h-[72px] rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-[14px] text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                        textAlignVertical="top"
                      />
                    </View>
                  </KeyboardAwareScrollView>
                  <View
                    style={{ paddingBottom: Math.max(insets.bottom, 12) }}
                    className="flex-row gap-3 border-t border-slate-100 px-5 py-3 dark:border-slate-800"
                  >
                    <TouchableOpacity
                      onPress={() => setIsAddDialogOpen(false)}
                      className="h-12 flex-1 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800"
                    >
                      <Text className="font-semibold text-slate-700 dark:text-slate-200">Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      disabled={isAdding}
                      onPress={() => void handleAddRoom()}
                      className="h-12 flex-1 items-center justify-center rounded-xl"
                      style={{ backgroundColor: primaryColor, opacity: isAdding ? 0.7 : 1 }}
                    >
                      {isAdding ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text className="font-bold text-white">Create Room</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              )
            })()}
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal visible={!!previewTenant} transparent animationType="none" onRequestClose={() => setPreviewTenant(null)}>
        <Pressable className="flex-1 justify-center bg-black/55 px-5" onPress={() => setPreviewTenant(null)}>
          {previewTenant ? (
            <Pressable
              onPress={(e) => e.stopPropagation()}
              className="max-h-[90%] overflow-hidden rounded-3xl border border-slate-200/90 bg-white dark:border-slate-800 dark:bg-slate-950"
            >
              <LinearGradient
                colors={[`${primaryColor}14`, `${primaryColor}06`, "transparent"]}
                style={{ paddingHorizontal: 24, paddingBottom: 16, paddingTop: 24 }}
              >
                <View className="flex-row items-center gap-4">
                  <LinearGradient
                    colors={[`${primaryColor}25`, `${primaryColor}12`]}
                    style={{
                      height: 56,
                      width: 56,
                      borderRadius: 16,
                      alignItems: "center",
                      justifyContent: "center",
                      borderWidth: 1,
                      borderColor: `${primaryColor}35`,
                    }}
                  >
                    <Text style={{ color: primaryColor }} className="text-[22px] font-black">
                      {previewTenant.name.charAt(0).toUpperCase()}
                    </Text>
                  </LinearGradient>
                  <View className="min-w-0 flex-1">
                    <Text numberOfLines={2} className="text-lg font-black text-slate-900 dark:text-white">
                      {previewTenant.name}
                    </Text>
                    <Text className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">Room {previewTenant.roomNumber}</Text>
                    <View className="mt-2 self-start rounded-full bg-slate-100 px-2 py-0.5 dark:bg-slate-900">
                      <Text className="text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                        {previewTenant.status.replace(/_/g, " ")}
                      </Text>
                    </View>
                  </View>
                </View>
              </LinearGradient>
              <View className="gap-3 px-6 pb-2 pt-4">
                {(
                  [
                    { icon: Phone, label: "Phone", value: previewTenant.phone || "—" },
                    { icon: Mail, label: "Email", value: previewTenant.email || "—" },
                    {
                      icon: CalendarDays,
                      label: "Move-in",
                      value: previewTenant.moveInDate
                        ? new Date(previewTenant.moveInDate).toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })
                        : "—",
                    },
                    {
                      icon: IndianRupee,
                      label: "Monthly Rent",
                      value: previewTenant.rentAmount ? `₹${previewTenant.rentAmount.toLocaleString()}` : "—",
                    },
                  ] as const
                ).map((row) => {
                  const RowIcon = row.icon
                  return (
                    <View key={row.label} className="flex-row items-center gap-3">
                      <View className="h-9 w-9 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-900">
                        <RowIcon size={16} color="#64748b" />
                      </View>
                      <View className="min-w-0 flex-1">
                        <Text className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          {row.label}
                        </Text>
                        <Text numberOfLines={2} className="text-[13px] font-semibold text-slate-900 dark:text-slate-50">
                          {row.value}
                        </Text>
                      </View>
                    </View>
                  )
                })}
              </View>
              <View className="px-6 pb-6 pt-4">
                <TouchableOpacity
                  onPress={() => {
                    const id = previewTenant.id
                    setPreviewTenant(null)
                    router.push({ pathname: "/(tabs)/tenants", params: { tenant: String(id) } })
                  }}
                  className="h-12 flex-row items-center justify-center gap-2 rounded-xl"
                  style={{ backgroundColor: primaryColor }}
                >
                  <Text className="font-bold text-white">View Full Profile</Text>
                  <ArrowRight size={18} color="#ffffff" />
                </TouchableOpacity>
              </View>
            </Pressable>
          ) : null}
        </Pressable>
      </Modal>

      {/* Confirm Delete Room Modal */}
      <ConfirmModal
        visible={deleteConfirmVisible}
        title="Delete Room"
        message={`Are you sure you want to delete Room ${selectedRoom?.number || ''}? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        isDestructive={true}
        onConfirm={confirmDeleteRoom}
        onCancel={() => setDeleteConfirmVisible(false)}
        icon={<Trash2 size={24} color="#ef4444" />}
      />

      {renderDetailSheet}
    </SafeAreaView>
  )
}
