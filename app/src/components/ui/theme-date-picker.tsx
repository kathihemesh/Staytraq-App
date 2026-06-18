import React, { useState, useMemo } from "react"
import { 
  View, 
  Text, 
  TouchableOpacity, 
  Modal, 
  ScrollView
} from "react-native"
import { Calendar, ChevronLeft, ChevronRight, X } from "lucide-react-native"
import useTheme from "@/hooks/use-theme"

interface ThemeDatePickerProps {
  value: string // YYYY-MM-DD
  onChange: (date: string) => void
  label?: string
  placeholder?: string
}

export default function ThemeDatePicker({ 
  value, 
  onChange, 
  label, 
  placeholder = "Select Date" 
}: ThemeDatePickerProps) {
  const { isDark } = useTheme()
  const [modalVisible, setModalVisible] = useState(false)

  // Current calendar view month and year
  const [viewDate, setViewDate] = useState(() => {
    const d = value ? new Date(value) : new Date()
    return isNaN(d.getTime()) ? new Date() : d
  })

  const currentYear = viewDate.getFullYear()
  const currentMonth = viewDate.getMonth() // 0-indexed

  // Format date display
  const displayValue = useMemo(() => {
    if (!value) return ""
    const d = new Date(value)
    if (isNaN(d.getTime())) return value
    return d.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric"
    })
  }, [value])

  const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ]

  const handlePrevMonth = () => {
    setViewDate(new Date(currentYear, currentMonth - 1, 1))
  }

  const handleNextMonth = () => {
    setViewDate(new Date(currentYear, currentMonth + 1, 1))
  }

  const handleSelectDay = (day: number) => {
    const selected = new Date(currentYear, currentMonth, day)
    const yyyy = selected.getFullYear()
    const mm = String(selected.getMonth() + 1).padStart(2, '0')
    const dd = String(selected.getDate()).padStart(2, '0')
    onChange(`${yyyy}-${mm}-${dd}`)
    setModalVisible(false)
  }

  // Generate calendar days
  const calendarCells = useMemo(() => {
    const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay()
    const totalDays = new Date(currentYear, currentMonth + 1, 0).getDate()

    const cells: (number | null)[] = []
    
    // Empty cells before the 1st of the month
    for (let i = 0; i < firstDayIndex; i++) {
      cells.push(null)
    }

    // Days of the month
    for (let day = 1; day <= totalDays; day++) {
      cells.push(day)
    }

    return cells
  }, [currentYear, currentMonth])

  // Split cells into rows of 7 days
  const rows = useMemo(() => {
    const list: (number | null)[][] = []
    for (let i = 0; i < calendarCells.length; i += 7) {
      list.push(calendarCells.slice(i, i + 7))
    }
    return list
  }, [calendarCells])

  const selectedDay = useMemo(() => {
    if (!value) return null
    const d = new Date(value)
    if (isNaN(d.getTime())) return null
    if (d.getFullYear() === currentYear && d.getMonth() === currentMonth) {
      return d.getDate()
    }
    return null
  }, [value, currentYear, currentMonth])

  const today = useMemo(() => {
    const t = new Date()
    if (t.getFullYear() === currentYear && t.getMonth() === currentMonth) {
      return t.getDate()
    }
    return null
  }, [currentYear, currentMonth])

  return (
    <View className="gap-1.5">
      {label && (
        <Text className="text-[10px] font-bold text-muted uppercase tracking-wider">
          {label}
        </Text>
      )}

      <TouchableOpacity
        onPress={() => {
          const d = value ? new Date(value) : new Date()
          setViewDate(isNaN(d.getTime()) ? new Date() : d)
          setModalVisible(true)
        }}
        activeOpacity={0.8}
        className="flex-row items-center justify-between border border-border dark:border-border-dark rounded-xl px-3.5 py-2.5 bg-background dark:bg-background-dark h-11 active:scale-[0.98] transition-transform"
      >
        <Text className={`text-sm ${value ? "text-foreground dark:text-foreground-dark font-semibold" : "text-muted"}`}>
          {displayValue || placeholder}
        </Text>
        <Calendar size={16} color={isDark ? "#94a3b8" : "#64748b"} />
      </TouchableOpacity>

      <Modal
        visible={modalVisible}
        transparent
        animationType="none"
        onRequestClose={() => setModalVisible(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setModalVisible(false)}
          className="flex-1 bg-black/60 justify-center items-center p-6"
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-card dark:bg-card-dark border border-border dark:border-border-dark rounded-3xl p-5 shadow-2xl"
          >
            {/* Header */}
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-base font-black text-foreground dark:text-foreground-dark">
                {label || "Select Date"}
              </Text>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                className="h-8 w-8 bg-muted/10 rounded-full items-center justify-center active:bg-muted/20"
              >
                <X size={16} color={isDark ? "#94a3b8" : "#64748b"} />
              </TouchableOpacity>
            </View>

            {/* Month Year Selector */}
            <View className="flex-row justify-between items-center bg-muted/5 dark:bg-muted-dark/5 rounded-xl px-2 py-1.5 mb-4 border border-border/30">
              <TouchableOpacity
                onPress={handlePrevMonth}
                className="h-8 w-8 items-center justify-center rounded-lg hover:bg-muted/10 active:scale-95"
              >
                <ChevronLeft size={16} color={isDark ? "#0091ff" : "#0071df"} />
              </TouchableOpacity>
              
              <Text className="text-sm font-black text-foreground dark:text-foreground-dark">
                {MONTH_NAMES[currentMonth]} {currentYear}
              </Text>
              
              <TouchableOpacity
                onPress={handleNextMonth}
                className="h-8 w-8 items-center justify-center rounded-lg hover:bg-muted/10 active:scale-95"
              >
                <ChevronRight size={16} color={isDark ? "#0091ff" : "#0071df"} />
              </TouchableOpacity>
            </View>

            {/* Days of Week Header */}
            <View className="flex-row mb-2">
              {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((dayName) => (
                <View key={dayName} className="flex-1 items-center justify-center py-1">
                  <Text className="text-[10px] font-black text-muted uppercase">
                    {dayName}
                  </Text>
                </View>
              ))}
            </View>

            {/* Calendar Grid */}
            <View className="gap-1.5">
              {rows.map((row, rowIndex) => (
                <View key={`row-${rowIndex}`} className="flex-row">
                  {row.map((dayNum, cellIndex) => {
                    if (dayNum === null) {
                      return <View key={`empty-${cellIndex}`} className="flex-1 h-9" />
                    }

                    const isSelected = selectedDay === dayNum
                    const isToday = today === dayNum

                    return (
                      <TouchableOpacity
                        key={`day-${dayNum}`}
                        onPress={() => handleSelectDay(dayNum)}
                        className={`flex-1 h-9 rounded-lg items-center justify-center relative active:scale-95 ${
                          isSelected 
                            ? "bg-primary shadow-sm shadow-primary/20" 
                            : "bg-transparent hover:bg-muted/5"
                        }`}
                      >
                        <Text className={`text-xs font-bold ${
                          isSelected 
                            ? "text-white font-black" 
                            : isToday 
                              ? "text-primary font-black" 
                              : "text-foreground dark:text-foreground-dark"
                        }`}>
                          {dayNum}
                        </Text>
                        
                        {isToday && !isSelected && (
                          <View className="absolute bottom-1 h-1 w-1 bg-primary rounded-full" />
                        )}
                      </TouchableOpacity>
                    )
                  })}
                </View>
              ))}
            </View>

            {/* Bottom Actions */}
            <View className="flex-row gap-3 mt-5 border-t border-border/40 pt-4">
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                className="flex-1 border border-border rounded-xl h-10 items-center justify-center active:scale-95"
              >
                <Text className="text-muted font-bold text-xs">Cancel</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  )
}
