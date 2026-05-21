/**
 * Room domain helpers — mirrored from StayTraq web `app/rooms/page.tsx`.
 */

export interface BedInfo {
  id: string
  label: string
  occupantName: string | null
}

export interface TenantPreview {
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

export interface Room {
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
}

export function floorNoToLabel(floorNo: number): string {
  if (floorNo === 0) return "Ground Floor"
  if (floorNo === 1) return "1st Floor"
  if (floorNo === 2) return "2nd Floor"
  if (floorNo === 3) return "3rd Floor"
  return `${floorNo}th Floor`
}

export function roomTypeToUi(dbType: string): "AC" | "Non-AC" {
  return dbType === "ac" ? "AC" : "Non-AC"
}

export function roomTypeToDb(uiType: "AC" | "Non-AC"): string {
  return uiType === "AC" ? "ac" : "non-ac"
}

export function generateBeds(totalBeds: number, occupiedBeds: number): BedInfo[] {
  return Array.from({ length: totalBeds }, (_, i) => ({
    id: `bed-${String.fromCharCode(65 + i)}`,
    label: `Bed ${String.fromCharCode(65 + i)}`,
    occupantName: i < occupiedBeds ? "Occupied" : null,
  }))
}

export function mapDbRowToRoom(row: {
  id: number | string
  room_number?: string | null
  floor_no?: number | null
  room_type?: string | null
  status?: string | null
  total_beds?: number | null
  occupied_beds?: number | null
  rent_amount?: number | null
  maintenance?: number | null
  notes?: string | null
}): Room {
  const totalBeds = Number(row.total_beds) || 0
  const occupiedBeds = Number(row.occupied_beds) || 0

  let computedStatus = (row.status || "vacant") as Room["status"]

  if (computedStatus !== "maintenance") {
    if (occupiedBeds === 0) {
      computedStatus = "vacant"
    } else if (occupiedBeds >= totalBeds && totalBeds > 0) {
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
    occupiedBeds,
  }
}

/** Build `{ [roomId]: tenants[] }` using the same traversal order as web. */
export function groupTenantsByRoomId(
  tenantRows:
    | {
        id: number
        name?: string | null
        mobile_number?: string | null
        email?: string | null
        room_id: number | null
        join_date?: string | null
        status?: string | null
        extra_charges?: number | null
      }[]
    | null,
  roomsMapped: Room[]
): Record<string, TenantPreview[]> {
  const byRoom: Record<string, TenantPreview[]> = {}
  for (const t of tenantRows || []) {
    if (t.room_id == null) continue
    const key = String(t.room_id)
    if (!byRoom[key]) byRoom[key] = []
    const matchedRoom = roomsMapped.find((r) => r.id === key)
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
  return byRoom
}

export type StatusVisual = {
  label: string
  /** Tailwind classNames for badge chip on cards */
  badge: string
  /** Progress-tint Tailwind bases (vacant/full/partial only; maintenance handled separately) */
  tintLive: string
}

export function getStatusConfig(status: Room["status"]): StatusVisual {
  switch (status) {
    case "vacant":
      return {
        label: "Vacant",
        badge:
          "bg-emerald-50/90 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border border-emerald-200/80 dark:border-emerald-800/40",
        tintLive: "bg-emerald-100/60 dark:bg-emerald-900/20",
      }
    case "partially occupied":
      return {
        label: "Partially Occupied",
        badge:
          "bg-sky-50/90 dark:bg-sky-950/30 text-sky-600 dark:text-sky-400 border border-sky-200/80 dark:border-sky-800/40",
        tintLive: "bg-sky-100/60 dark:bg-sky-900/20",
      }
    case "full":
      return {
        label: "Full",
        badge:
          "bg-rose-50/90 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 border border-rose-200/80 dark:border-rose-800/40",
        tintLive: "bg-rose-100/60 dark:bg-rose-900/20",
      }
    case "maintenance":
      return {
        label: "Maintenance",
        badge:
          "bg-amber-50/90 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 border border-amber-200/80 dark:border-amber-800/40",
        tintLive: "bg-amber-200/45 dark:bg-amber-900/35",
      }
  }
}
