import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { 
  View, 
  Text, 
  FlatList,
  ScrollView, 
  Pressable, 
  ActivityIndicator, 
  Modal, 
  TextInput, 
  RefreshControl,
  Image,
  Dimensions,
  Platform,
  Alert,
  Clipboard,
  Animated,
  StyleSheet,
  Share,
  KeyboardAvoidingView
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useFocusEffect } from "expo-router"
import { useAuth } from "@/context/auth"
import { supabase } from "@/lib/supabase"
import { scheduleAfterInteractions } from "@/lib/focus-fetch-scheduler"
import { 
  Inbox, 
  Copy, 
  Share2, 
  RefreshCw, 
  Check, 
  X, 
  AlertTriangle, 
  Info, 
  Calendar, 
  Clock, 
  ShieldCheck, 
  ChevronRight,
  MessageSquare,
  Eye,
  SlidersHorizontal,
  Sparkles,
  QrCode,
  Download
} from "lucide-react-native"
import * as Haptics from "expo-haptics"
import useTheme from "@/hooks/use-theme"
import { KeyboardAwareScrollView, useKeyboardAwareInput } from "@/components/ui/keyboard-aware-scroll-view"
import { LinearGradient } from "expo-linear-gradient"
import { File, Paths } from "expo-file-system"
import * as MediaLibrary from "expo-media-library"
import { ConfirmModal } from "@/components/ui/confirm-modal"
import { SafeText } from "@/components/ui/safe-text"
import { sanitizeText, stripHtml } from "@/lib/sanitize"

type Complaint = {
  id: number
  owner_id: string
  complaint_message: string
  status: "Under Working" | "Resolved" | "Ignored"
  owner_response: string | null
  created_at: string
  updated_at: string
}

const { width } = Dimensions.get("window")

export default function ComplaintsScreen() {
  const { user } = useAuth()
  const { isDark } = useTheme()
  const [loading, setLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [complaints, setComplaints] = useState<Complaint[]>([])
  const [complaintToken, setComplaintToken] = useState("")
  const [isRefreshingLink, setIsRefreshingLink] = useState(false)
  const hasLoadedOnce = useRef(false)

  // Custom Toast State
  const [toast, setToast] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type: "success" | "error" | "info" | "warning";
  }>({
    visible: false,
    title: "",
    message: "",
    type: "success",
  })
  const toastTranslateX = useRef(new Animated.Value(300)).current
  const toastOpacity = useRef(new Animated.Value(0)).current
  const toastTimeoutRef = useRef<any>(null)

  // QR Code Modal State
  const [qrModalVisible, setQrModalVisible] = useState(false)
  const [confirmModalVisible, setConfirmModalVisible] = useState(false)

  // Detail Modal State
  const [detailModalVisible, setDetailModalVisible] = useState(false)
  const [selectedComplaint, setSelectedComplaint] = useState<Complaint | null>(null)
  const [updatedStatus, setUpdatedStatus] = useState<Complaint["status"]>("Under Working")
  const [ownerResponseText, setOwnerResponseText] = useState("")
  const [isSavingDetails, setIsSavingDetails] = useState(false)

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("Under Working")
  const [searchQuery, setSearchQuery] = useState("")

  const responseInput = useKeyboardAwareInput()

  const showToast = useCallback((title: string, message: string, type: "success" | "error" | "info" | "warning" = "success") => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current)
    }

    setToast({ visible: true, title, message, type })

    toastTranslateX.setValue(300)
    toastOpacity.setValue(0)

    Animated.parallel([
      Animated.spring(toastTranslateX, {
        toValue: 0,
        tension: 65,
        friction: 10,
        useNativeDriver: true,
      }),
      Animated.timing(toastOpacity, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      })
    ]).start()

    toastTimeoutRef.current = setTimeout(() => {
      Animated.parallel([
        Animated.timing(toastTranslateX, {
          toValue: 300,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(toastOpacity, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        })
      ]).start(() => {
        setToast((prev) => ({ ...prev, visible: false }))
      })
    }, 2000)
  }, [toastTranslateX, toastOpacity])

  const fetchComplaintsData = useCallback(async (silent = false) => {
    if (!user?.id) {
      setLoading(false)
      return
    }
    try {
      if (!silent) {
        if (!hasLoadedOnce.current) setLoading(true)
        else setIsRefreshing(true)
      }

      // Fetch complaints and pg_owners token concurrently
      const [complaintsResult, ownerResult] = await Promise.all([
        supabase
          .from("complaints")
          .select("id, owner_id, complaint_message, status, owner_response, created_at, updated_at")
          .eq("owner_id", user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("pg_owners")
          .select("complaint_token")
          .eq("id", user.id)
          .single()
      ])

      if (complaintsResult.error) throw complaintsResult.error
      setComplaints((complaintsResult.data || []) as Complaint[])

      if (ownerResult.error) throw ownerResult.error

      let activeToken = ownerResult.data?.complaint_token
      if (!activeToken) {
        // Generate on the fly if missing
        activeToken = Math.random().toString(36).substring(2, 14)
        void (async () => {
          try {
            await supabase
              .from("pg_owners")
              .update({ complaint_token: activeToken })
              .eq("id", user.id)
          } catch (err) {
            console.error("Error updating complaint token:", err)
          }
        })()
      }
      setComplaintToken(activeToken || "")
      hasLoadedOnce.current = true
    } catch (err) {
      console.error("Error fetching complaints:", err)
      showToast("Error", "Failed to retrieve complaints.", "error")
    } finally {
      setLoading(false)
      setIsRefreshing(false)
    }
  }, [user?.id])

  useFocusEffect(
    useCallback(() => {
      if (user?.id) {
        // Defer the on-focus fetch past the navigation transition / first interactive
        // paint via the shared scheduler (Change A); the load runs once per focus and is
        // cancelled on blur-before-run so it is neither dropped nor duplicated.
        const handle = scheduleAfterInteractions(() => {
          void fetchComplaintsData(hasLoadedOnce.current)
        })
        return () => handle.cancel()
      }
    }, [user?.id, fetchComplaintsData])
  )

  // Realtime updates
  useEffect(() => {
    if (!user?.id) return

    const channel = supabase
      .channel(`complaints_realtime_${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "complaints", filter: `owner_id=eq.${user.id}` },
        () => {
          void fetchComplaintsData(true)
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [user?.id, fetchComplaintsData])

  const onRefresh = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    void fetchComplaintsData()
  }, [fetchComplaintsData])

  const portalUrl = `https://staytraq.vercel.app/complaint-submit/${complaintToken}`

  const handleCopyLink = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    Clipboard.setString(portalUrl)
    showToast("Link Copied", "Complaint Box link copied to clipboard.", "success")
  }

  const handleShareLink = async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    try {
      await Share.share({
        message: `Submit your PG complaints anonymously here: ${portalUrl}`
      })
      showToast("Link Shared", "Native share sheet opened.", "success")
    } catch (err) {
      console.error("Share error:", err)
    }
  }

  const handleRegenerateLink = () => {
    setConfirmModalVisible(true)
  }

  const confirmRegenerate = async () => {
    setConfirmModalVisible(false)
    if (!user?.id) return
    setIsRefreshingLink(true)
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    try {
      const newToken = Math.random().toString(36).substring(2, 14)
      const { error } = await supabase
        .from("pg_owners")
        .update({ complaint_token: newToken })
        .eq("id", user.id)

      if (error) throw error
      setComplaintToken(newToken)
      showToast("Link Regenerated", "A new anonymous submission URL has been generated.", "success")
    } catch (err) {
      console.error("Error regenerating complaint link:", err)
      showToast("Error", "Failed to regenerate submission link.", "error")
    } finally {
      setIsRefreshingLink(false)
    }
  }

  // Save changes from Detail Modal Drawer
  const handleSaveDetails = async () => {
    if (!selectedComplaint) return
    setIsSavingDetails(true)
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)

    try {
      const { error } = await supabase
        .from("complaints")
        .update({
          status: updatedStatus,
          owner_response: stripHtml(ownerResponseText.trim()) || null,
          updated_at: new Date().toISOString()
        })
        .eq("id", selectedComplaint.id)

      if (error) throw error

      showToast("Complaint Updated", "Changes saved successfully.", "success")
      setDetailModalVisible(false)
      void fetchComplaintsData(true)
    } catch (err) {
      console.error("Error saving complaint details:", err)
      showToast("Error", "Failed to save updates.", "error")
    } finally {
      setIsSavingDetails(false)
    }
  }

  const openDetailModal = (complaint: Complaint) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setSelectedComplaint(complaint)
    setUpdatedStatus(complaint.status)
    setOwnerResponseText(complaint.owner_response || "")
    setDetailModalVisible(true)
  }

  // Stats computed
  const stats = useMemo(() => {
    return {
      total: complaints.length,
      underWorking: complaints.filter(c => c.status === "Under Working").length,
      resolved: complaints.filter(c => c.status === "Resolved").length,
      ignored: complaints.filter(c => c.status === "Ignored").length,
    }
  }, [complaints])

  const getChipCount = useCallback((chip: string) => {
    switch (chip) {
      case "all":
        return stats.total
      case "Under Working":
        return stats.underWorking
      case "Resolved":
        return stats.resolved
      case "Ignored":
        return stats.ignored
      default:
        return 0
    }
  }, [stats])

  // Filter complaints
  const filteredComplaints = useMemo(() => {
    return complaints.filter((c) => {
      const matchesStatus = statusFilter === "all" || c.status.toLowerCase() === statusFilter.toLowerCase()
      const matchesSearch = c.complaint_message.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            (c.owner_response && c.owner_response.toLowerCase().includes(searchQuery.toLowerCase()))
      return matchesStatus && matchesSearch
    })
  }, [complaints, statusFilter, searchQuery])

  // Formatting date
  const formatDate = (isoString: string) => {
    const d = new Date(isoString)
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
  }

  // Toast icons
  const getToastIcon = (type: "success" | "error" | "info" | "warning", isDark: boolean) => {
    const color = isDark 
      ? (type === "success" ? "#4ade80" : type === "error" ? "#f87171" : type === "warning" ? "#fbbf24" : "#60a5fa")
      : (type === "success" ? "#16a34a" : type === "error" ? "#dc2626" : type === "warning" ? "#d97706" : "#2563eb")
    
    switch (type) {
      case "success": return <Check size={16} color={color} strokeWidth={3} />
      case "error": return <X size={16} color={color} strokeWidth={3} />
      case "warning": return <AlertTriangle size={16} color={color} strokeWidth={3} />
      default: return <Info size={16} color={color} strokeWidth={3} />
    }
  }

  const getToastBorderColor = (type: "success" | "error" | "info" | "warning", isDark: boolean) => {
    return isDark
      ? (type === "success" ? "rgba(74, 222, 128, 0.25)" : type === "error" ? "rgba(248, 113, 113, 0.25)" : type === "warning" ? "rgba(251, 191, 36, 0.25)" : "rgba(96, 165, 250, 0.25)")
      : (type === "success" ? "rgba(22, 163, 74, 0.25)" : type === "error" ? "rgba(220, 38, 38, 0.25)" : type === "warning" ? "rgba(217, 119, 6, 0.25)" : "rgba(37, 99, 235, 0.25)")
  }

  const getStatusBadgeConfig = (status: Complaint["status"]) => {
    switch (status) {
      case "Resolved":
        return {
          bgLight: "#ecfdf5",
          bgDark: "rgba(16, 185, 129, 0.1)",
          borderLight: "#a7f3d0",
          borderDark: "rgba(16, 185, 129, 0.3)",
          textLight: "#047857",
          textDark: "#34d399",
        }
      case "Ignored":
        return {
          bgLight: "#f1f5f9",
          bgDark: "rgba(30, 41, 59, 0.6)",
          borderLight: "#cbd5e1",
          borderDark: "rgba(51, 65, 85, 0.4)",
          textLight: "#475569",
          textDark: "#94a3b8",
        }
      default: // Under Working
        return {
          bgLight: "#fffbeb",
          bgDark: "rgba(245, 158, 11, 0.1)",
          borderLight: "#fde68a",
          borderDark: "rgba(245, 158, 11, 0.3)",
          textLight: "#b45309",
          textDark: "#fbbf24",
        }
    }
  }

  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(portalUrl)}`
  const [isDownloading, setIsDownloading] = useState(false)

  const handleDownloadQR = async () => {
    setIsDownloading(true)
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync(true)
      if (status !== "granted") {
        Alert.alert("Permission Required", "We need permission to save the QR code to your gallery.")
        return
      }

      const filename = `staytraq-complaints-qr-${Date.now()}.png`
      const file = new File(Paths.document, filename)

      const downloadedFile = await File.downloadFileAsync(qrImageUrl, file)

      const asset = await MediaLibrary.createAssetAsync(downloadedFile.uri)
      await MediaLibrary.createAlbumAsync("Staytraq QR", asset, false)

      showToast("Downloaded", "QR Code saved to gallery.", "success")
    } catch (err) {
      console.error("Download error:", err)
      showToast("Error", "Failed to download QR code.", "error")
    } finally {
      setIsDownloading(false)
    }
  }

  const renderToast = () => {
    if (!toast.visible) return null
    return (
      <Animated.View
        style={[
          styles.toastContainer,
          isDark ? styles.toastDark : styles.toastLight,
          {
            transform: [{ translateX: toastTranslateX }],
            opacity: toastOpacity,
            borderColor: getToastBorderColor(toast.type, isDark)
          }
        ]}
      >
        <View style={styles.toastIconContainer}>
          {getToastIcon(toast.type, isDark)}
        </View>
        <View className="flex-1 ml-2">
          <Text className="text-[11px] font-black text-slate-900 dark:text-white">{toast.title}</Text>
          <Text className="text-[9px] text-slate-500 dark:text-slate-400 font-medium mt-0.5" numberOfLines={2}>
            {toast.message}
          </Text>
        </View>
      </Animated.View>
    )
  }

  if (loading && complaints.length === 0) {
    return (
      <SafeAreaView key="complaints-loading" edges={["top"]} style={{ flex: 1 }} className="bg-slate-50 dark:bg-slate-950">
        <View style={{ flex: 1 }}>
          {/* Top Header Card */}
          <View className="px-6 pt-4 pb-5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 relative overflow-hidden">
            <LinearGradient
              colors={isDark ? ["rgba(239, 68, 68, 0.15)", "transparent"] : ["rgba(239, 68, 68, 0.05)", "transparent"]}
              style={StyleSheet.absoluteFillObject}
            />
            <View className="flex-row justify-between items-center z-10">
              <View>
                <Text className="text-[22px] font-black text-slate-900 dark:text-white leading-tight">Complaint Box</Text>
                <Text className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-1">Manage anonymous tenant support</Text>
              </View>
              <View className="h-10 w-10 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center justify-center">
                <Inbox size={20} color="#ef4444" />
              </View>
            </View>
          </View>
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#ef4444" />
            <Text className="text-xs text-slate-400 font-medium mt-3">Loading complaints...</Text>
          </View>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView key="complaints-loaded" edges={["top"]} style={{ flex: 1 }} className="bg-slate-50 dark:bg-slate-950">
      <View style={{ flex: 1 }}>
        {/* Top Header Card */}
        <View className="px-6 pt-4 pb-5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 relative overflow-hidden">
          <LinearGradient
            colors={isDark ? ["rgba(239, 68, 68, 0.15)", "transparent"] : ["rgba(239, 68, 68, 0.05)", "transparent"]}
            style={StyleSheet.absoluteFillObject}
          />
          <View className="flex-row justify-between items-center z-10">
            <View>
              <Text className="text-[22px] font-black text-slate-900 dark:text-white leading-tight">Complaint Box</Text>
              <Text className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-1">Manage anonymous tenant support</Text>
            </View>
            <View className="h-10 w-10 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center justify-center">
              <Inbox size={20} color="#ef4444" />
            </View>
          </View>
        </View>

        {/* Scrollable Dashboard Area */}
        <ScrollView 
          className="flex-1 px-4 pt-4"
          contentContainerStyle={{ paddingBottom: 130 }}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor="#ef4444" />
          }
        >
          {/* Link Management Section */}
          <View className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 mb-5 shadow-sm">
            <View className="flex-row justify-between items-center mb-4">
              <View className="flex-row items-center gap-2">
                <View className="h-6 w-6 bg-red-500/10 rounded-md flex items-center justify-center">
                  <ShieldCheck size={14} color="#ef4444" />
                </View>
                <Text className="text-sm font-black text-slate-900 dark:text-white">Tenant Submission Portal</Text>
              </View>
              {isRefreshingLink && <ActivityIndicator size="small" color="#ef4444" />}
            </View>

            <Text className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed mb-4">
              Share this secure, owner-specific link or QR code with tenants to let them submit complaints anonymously.
            </Text>

            {/* Link Box */}
            <View className="bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl px-4 py-3 mb-4 flex-row items-center justify-between">
              <Text className="text-xs text-slate-600 dark:text-slate-300 font-semibold truncate flex-1 mr-4" numberOfLines={1}>
                {portalUrl}
              </Text>
              <Pressable 
                className="h-8 w-8 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-center"
                style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                onPress={handleCopyLink}
              >
                <Copy size={14} color={isDark ? "#cbd5e1" : "#475569"} />
              </Pressable>
            </View>

            {/* Link Management Actions */}
            <View className="flex-row gap-2">
              <Pressable 
                className="flex-1 bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 py-2.5 rounded-xl"
                style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                onPress={() => setQrModalVisible(true)}
              >
                <View className="flex-row items-center justify-center w-full gap-1.5">
                  <QrCode size={13} color="#ef4444" />
                  <Text className="text-xs font-black text-red-600 dark:text-red-400">Show QR</Text>
                </View>
              </Pressable>

              <Pressable 
                className="flex-1 bg-red-600 py-2.5 rounded-xl"
                style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                onPress={handleShareLink}
              >
                <View className="flex-row items-center justify-center w-full gap-1.5">
                  <Share2 size={13} color="#ffffff" />
                  <Text className="text-xs font-black text-white">Share Link</Text>
                </View>
              </Pressable>

              <Pressable 
                className="h-10 w-10 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-center"
                style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                onPress={handleRegenerateLink}
              >
                <RefreshCw size={14} color={isDark ? "#cbd5e1" : "#475569"} />
              </Pressable>
            </View>
          </View>

          {/* Filters & Complaint Header */}
          <View className="flex-row items-center gap-2 mb-3">
            <SlidersHorizontal size={14} color={isDark ? "#94a3b8" : "#475569"} />
            <Text className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider">Complaints Listing</Text>
          </View>

          {/* Search Box */}
          <View className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl px-4 py-2 mb-4 flex-row items-center gap-2 shadow-sm">
            <TextInput
              placeholder="Search complaints..."
              placeholderTextColor={isDark ? "#475569" : "#94a3b8"}
              value={searchQuery}
              onChangeText={setSearchQuery}
              className="text-xs text-slate-900 dark:text-white flex-1 py-1 font-semibold"
            />
            {searchQuery.length > 0 && (
              <Pressable 
                onPress={() => setSearchQuery("")}
                style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
              >
                <X size={14} color={isDark ? "#94a3b8" : "#475569"} />
              </Pressable>
            )}
          </View>

          {/* Filter Scroll Chips */}
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false} 
            className="flex-row mb-5"
          >
            {["all", "Under Working", "Resolved", "Ignored"].map((chip) => {
              const active = statusFilter.toLowerCase() === chip.toLowerCase()
              const getActiveChipClass = () => {
                switch (chip) {
                  case "all":
                    return "bg-amber-600 border-amber-600"
                  case "Under Working":
                    return "bg-blue-600 border-blue-600"
                  case "Resolved":
                    return "bg-emerald-600 border-emerald-600"
                  case "Ignored":
                    return "bg-red-600 border-red-600"
                  default:
                    return "bg-red-600 border-red-600"
                }
              }
              return (
                <Pressable
                  key={chip}
                  onPress={() => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                    setStatusFilter(chip)
                  }}
                  style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                  className={`px-3.5 py-1.5 rounded-full border mr-2 flex-row items-center gap-1.5 ${
                    active 
                      ? getActiveChipClass() 
                      : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                  }`}
                >
                  <Text 
                    className={`text-xs font-black ${
                      active ? "text-white" : "text-slate-600 dark:text-slate-400"
                    }`}
                  >
                    {chip === "all" ? "All" : (chip === "Under Working" ? "Working" : chip)}
                  </Text>
                  {loading ? (
                    <View className="h-4 w-6 bg-slate-200/50 dark:bg-slate-800/35 rounded-full items-center justify-center" />
                  ) : (
                    <View 
                      className={`rounded-full px-1.5 py-0.5 items-center justify-center min-w-[18px] ${
                        active ? "bg-white/20" : "bg-slate-100 dark:bg-white/10"
                      }`}
                    >
                      <Text 
                        className={`text-[9px] font-black ${
                          active ? "text-white" : "text-slate-600 dark:text-slate-400"
                        }`}
                      >
                        {getChipCount(chip)}
                      </Text>
                    </View>
                  )}
                </Pressable>
              )
            })}
          </ScrollView>

          {filteredComplaints.length === 0 ? (
            /* Empty State */
            <View key="empty-state" className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 items-center text-center shadow-sm mb-12">
              <View className="h-16 w-16 bg-red-500/5 rounded-full flex items-center justify-center mb-4 border border-red-500/10">
                <Inbox size={26} color="#ef4444" />
              </View>
              <Text className="text-sm font-black text-slate-900 dark:text-white mb-1">
                {searchQuery ? "No search results" : "Empty Inbox"}
              </Text>
              <Text className="text-xs text-slate-500 dark:text-slate-400 max-w-[240px] text-center leading-relaxed">
                {searchQuery 
                  ? "No complaints match your query. Try broadening your keywords." 
                  : "All quiet! No complaints have been submitted yet. Share the submission link above."}
              </Text>
            </View>
          ) : (
            /* List of Complaints */
            <View key="list-state" className="space-y-3 mb-16">
              {filteredComplaints.map((item) => {
                const badge = getStatusBadgeConfig(item.status)
                return (
                  <Pressable
                    key={`${item.id}-${item.status}`}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm"
                    style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1 }]}
                    onPress={() => openDetailModal(item)}
                  >
                    <View className="flex-row justify-between items-start mb-2">
                      <View className="flex-row items-center gap-1.5">
                        <Clock size={12} color="#64748b" />
                        <Text className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
                          {formatDate(item.created_at)}
                        </Text>
                      </View>
                      <View 
                        className="rounded-full border px-2 py-0.5"
                        style={{
                          backgroundColor: isDark ? badge.bgDark : badge.bgLight,
                          borderColor: isDark ? badge.borderDark : badge.borderLight,
                        }}
                      >
                        <Text 
                          className="text-[9px] font-black uppercase tracking-wider"
                          style={{
                            color: isDark ? badge.textDark : badge.textLight,
                          }}
                        >
                          {item.status}
                        </Text>
                      </View>
                    </View>

                    <SafeText 
                      className={`text-xs text-slate-800 dark:text-slate-200 leading-relaxed font-semibold ${item.owner_response ? "mb-2" : ""}`}
                      numberOfLines={2}
                    >
                      {item.complaint_message}
                    </SafeText>

                    {/* Inline Owner Response Display */}
                    {item.owner_response && (
                      <View className="bg-slate-50 dark:bg-slate-950/60 border border-slate-200/60 dark:border-slate-800/60 rounded-xl px-2.5 py-1.5 flex-row items-center gap-2">
                        <MessageSquare size={12} color="#64748b" />
                        <SafeText className="text-[11px] text-slate-600 dark:text-slate-300 font-medium flex-1" numberOfLines={2}>
                          <Text className="text-[10px] text-slate-400 dark:text-slate-500 font-extrabold uppercase tracking-wide mr-1">Reply: </Text>
                          {item.owner_response}
                        </SafeText>
                      </View>
                    )}
                  </Pressable>
                )
              })}
            </View>
          )}
        </ScrollView>
      </View>

      {/* QR Code Modal Overlay */}
      <Modal
        visible={qrModalVisible}
        transparent
        animationType="none"
        onRequestClose={() => setQrModalVisible(false)}
      >
        <View className="flex-1 bg-black/60 backdrop-blur-sm justify-center items-center p-4">
          <View className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-sm p-6 shadow-2xl items-center relative">
            <Pressable 
              className="absolute top-4 right-4 h-8 w-8 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full flex items-center justify-center"
              style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
              onPress={() => setQrModalVisible(false)}
            >
              <X size={14} color={isDark ? "#cbd5e1" : "#475569"} />
            </Pressable>

            <Text className="text-[15px] font-black text-slate-900 dark:text-white mb-1 mt-2">Portal QR Code</Text>
            <Text className="text-xs text-slate-400 dark:text-slate-500 font-bold mb-6 text-center">Scan to open the submission portal</Text>

            {/* QR Code Frame */}
            <View className="bg-white p-4 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-inner mb-6">
              <Image 
                source={{ uri: qrImageUrl }} 
                style={{ width: 200, height: 200 }} 
                className="rounded-lg"
              />
            </View>

            <Text className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold mb-6 max-w-[200px] text-center">
              Have tenants scan this code with their phone cameras to submit support requests.
            </Text>

            {/* Quick Actions in Modal */}
            <View className="flex-row w-full gap-2 mt-2">
              <Pressable 
                className="flex-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 py-3 rounded-xl flex-row items-center justify-center gap-1.5"
                style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                onPress={handleDownloadQR}
                disabled={isDownloading}
              >
                {isDownloading ? (
                  <ActivityIndicator size="small" color={isDark ? "#cbd5e1" : "#475569"} />
                ) : (
                  <>
                    <Download size={13} color={isDark ? "#cbd5e1" : "#475569"} />
                    <Text className="text-xs font-black text-slate-700 dark:text-slate-300">Download</Text>
                  </>
                )}
              </Pressable>
              
              <Pressable 
                className="flex-1 bg-red-600 py-3 rounded-xl flex-row items-center justify-center gap-1.5"
                style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                onPress={handleShareLink}
              >
                <Share2 size={13} color="#ffffff" />
                <Text className="text-xs font-black text-white">Share Portal</Text>
              </Pressable>
            </View>
          </View>
          {renderToast()}
        </View>
      </Modal>

      {/* Complaint Detail Modal Overlay */}
      <Modal
        visible={detailModalVisible}
        transparent
        animationType="none"
        onRequestClose={() => setDetailModalVisible(false)}
      >
        <View className="flex-1 bg-black/60 backdrop-blur-sm justify-end">
          <KeyboardAvoidingView
            behavior="padding"
            keyboardVerticalOffset={0}
            style={{ width: "100%", maxWidth: 448, marginLeft: "auto", marginRight: "auto" }}
          >
            <View className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 rounded-t-[32px] p-6 shadow-2xl">
              {/* Header */}
              <View className="flex-row justify-between items-center mb-5 pb-3 border-b border-slate-100 dark:border-slate-800/60">
                <View className="flex-row items-center gap-2">
                  <View className="h-6 w-6 bg-red-500/10 rounded-md flex items-center justify-center">
                    <Info size={14} color="#ef4444" />
                  </View>
                  <Text className="text-sm font-black text-slate-900 dark:text-white">Review Complaint</Text>
                </View>
                <Pressable 
                  className="h-8 w-8 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full flex items-center justify-center"
                  style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                  onPress={() => setDetailModalVisible(false)}
                >
                  <X size={14} color={isDark ? "#cbd5e1" : "#475569"} />
                </Pressable>
              </View>

              {/* Message Details */}
              <ScrollView className="max-h-[160px] mb-5 bg-slate-50 dark:bg-slate-950 p-4 border border-slate-100 dark:border-slate-850 rounded-2xl">
                <SafeText className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed font-semibold">
                  {selectedComplaint?.complaint_message}
                </SafeText>
              </ScrollView>

              {/* Status Selector */}
              <View className="mb-5">
                <Text className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500 mb-2.5">
                  Update Resolution Status
                </Text>
                <View className="flex-row bg-slate-100 dark:bg-slate-950 p-1 border border-slate-200 dark:border-slate-800 rounded-2xl">
                  {(["Under Working", "Resolved", "Ignored"] as Complaint["status"][]).map((st) => {
                    const active = updatedStatus === st
                    return (
                      <Pressable
                        key={st}
                        onPress={() => {
                          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                          setUpdatedStatus(st)
                        }}
                        style={({ pressed }) => [
                          { opacity: pressed ? 0.8 : 1 },
                          active && {
                            backgroundColor: isDark ? "#1e293b" : "#ffffff",
                            borderColor: isDark ? "#334155" : "#e2e8f0",
                            shadowColor: isDark ? "#000000" : "#64748b",
                            shadowOffset: { width: 0, height: 1 },
                            shadowOpacity: 0.1,
                            shadowRadius: 2,
                            elevation: 2,
                          }
                        ]}
                        className="flex-1 py-2 rounded-xl items-center border border-transparent"
                      >
                        <Text 
                          className="text-[10px] font-black"
                          style={{
                            color: active 
                              ? (isDark ? "#ffffff" : "#0f172a") 
                              : (isDark ? "#64748b" : "#94a3b8")
                          }}
                        >
                          {st === "Under Working" ? "Working" : st}
                        </Text>
                      </Pressable>
                    )
                  })}
                </View>
              </View>

              {/* Owner Response Input */}
              <View className="mb-6">
                <Text className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500 mb-2">
                  Owner Response / Action Reply
                </Text>
                <TextInput
                  placeholder="e.g. maintenance team scheduled for tomorrow morning..."
                  placeholderTextColor={isDark ? "#475569" : "#94a3b8"}
                  value={ownerResponseText}
                  onChangeText={setOwnerResponseText}
                  multiline
                  numberOfLines={3}
                  ref={responseInput.ref}
                  onFocus={responseInput.onFocus}
                  className="bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-white border border-slate-200 dark:border-slate-800 rounded-2xl px-4 py-3 min-h-[72px] font-semibold text-left"
                />
              </View>

              {/* Actions */}
              <View className="flex-row gap-2 mt-2">
                <Pressable 
                  className="flex-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 py-3.5 rounded-xl items-center"
                  style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                  onPress={() => setDetailModalVisible(false)}
                  disabled={isSavingDetails}
                >
                  <Text className="text-xs font-black text-slate-700 dark:text-slate-300">Cancel</Text>
                </Pressable>

                <Pressable 
                  className="flex-1 bg-red-600 py-3.5 rounded-xl items-center flex-row justify-center gap-1.5"
                  style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                  onPress={handleSaveDetails}
                  disabled={isSavingDetails}
                >
                  {isSavingDetails ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <>
                      <Check size={14} color="#ffffff" strokeWidth={3} />
                      <Text className="text-xs font-black text-white">Save Changes</Text>
                    </>
                  )}
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
          {renderToast()}
        </View>
      </Modal>

      {/* Confirm Regenerate Link Modal */}
      <ConfirmModal
        visible={confirmModalVisible}
        title="Regenerate Link"
        message="Are you sure you want to regenerate the complaint box link? The old link will stop working immediately."
        confirmText="Regenerate"
        cancelText="Cancel"
        isDestructive={false}
        onConfirm={confirmRegenerate}
        onCancel={() => setConfirmModalVisible(false)}
        icon={<RefreshCw size={24} color={isDark ? "#0091ff" : "#0071df"} />}
      />

      {/* Toast Notification Container */}
      {renderToast()}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  toastContainer: {
    position: "absolute",
    top: 60,
    left: 16,
    right: 16,
    borderRadius: 20,
    borderWidth: 1.5,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    zIndex: 9999,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 8,
  },
  toastLight: {
    backgroundColor: "#ffffff",
    shadowColor: "#64748b",
    shadowOpacity: 0.1,
  },
  toastDark: {
    backgroundColor: "#0f172a",
    shadowColor: "#000000",
    shadowOpacity: 0.4,
  },
  toastIconContainer: {
    height: 28,
    width: 28,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(100,116,139,0.08)"
  }
})
