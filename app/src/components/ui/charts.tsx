import { useMemo } from "react"
import { View, Text, useWindowDimensions } from "react-native"
import Svg, { Rect, G, Circle, Text as SvgText, Defs, LinearGradient, Stop } from "react-native-svg"
import useTheme from "@/hooks/use-theme"

interface RentCollectionData {
  month: string
  collected: number
  pending: number
}

interface PaymentStatusData {
  name: string
  value: number
  color: string
}

// 1. HIGH-PERFORMANCE ANIMATED SVG BAR CHART
export function RentCollectionChart({ data }: { data: RentCollectionData[] }) {
  const { width: windowWidth } = useWindowDimensions()
  const { isDark } = useTheme()
  const chartWidth = Math.min(windowWidth - 48, 500)
  const chartHeight = 220
  const paddingLeft = 45
  const paddingRight = 15
  const paddingTop = 20
  const paddingBottom = 30
  
  const graphWidth = chartWidth - paddingLeft - paddingRight
  const graphHeight = chartHeight - paddingTop - paddingBottom

  const maxVal = useMemo(
    () => Math.max(...data.map((d) => d.collected + d.pending), 10000),
    [data]
  )

  return (
    <View className="bg-card dark:bg-card-dark border border-border dark:border-border-dark p-4 rounded-3xl">
      <Text className="text-base font-semibold text-foreground dark:text-foreground-dark mb-4">
        Rent Collection History
      </Text>
      
      {data.length === 0 ? (
        <View className="h-44 items-center justify-center">
          <Text className="text-sm text-muted dark:text-muted-dark">No historical data available</Text>
        </View>
      ) : (
        <Svg width={chartWidth} height={chartHeight}>
          <Defs>
            <LinearGradient id="collectedGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={isDark ? "#0091ff" : "#0071df"} stopOpacity={0.85} />
              <Stop offset="100%" stopColor={isDark ? "#0091ff" : "#0071df"} stopOpacity={0.2} />
            </LinearGradient>
            <LinearGradient id="pendingGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor="#f59e0b" stopOpacity={0.7} />
              <Stop offset="100%" stopColor="#f59e0b" stopOpacity={0.15} />
            </LinearGradient>
          </Defs>

          {/* Grid lines & Y Axis */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
            const y = paddingTop + graphHeight * (1 - ratio)
            const val = Math.round((maxVal * ratio) / 1000) * 1000
            return (
              <G key={idx}>
                {/* Horizontal grid line */}
                <Rect
                  x={paddingLeft}
                  y={y}
                  width={graphWidth}
                  height={1}
                  fill="rgba(156, 163, 175, 0.08)"
                />
                {/* Y Axis label */}
                <SvgText
                  x={paddingLeft - 8}
                  y={y + 4}
                  fill="#9ca3af"
                  fontSize="10"
                  textAnchor="end"
                >
                  {val >= 1000 ? `₹${val / 1000}k` : `₹${val}`}
                </SvgText>
              </G>
            )
          })}

          {/* Bars */}
          {data.map((item, index) => {
            const numBars = data.length
            const barSpacing = graphWidth / numBars
            const xOffset = paddingLeft + index * barSpacing + barSpacing * 0.15
            const totalWidth = barSpacing * 0.7

            const colRatio = item.collected / maxVal
            const penRatio = item.pending / maxVal

            const colHeight = colRatio * graphHeight
            const penHeight = penRatio * graphHeight

            // Y positions (from top)
            const colY = paddingTop + graphHeight - colHeight
            const penY = colY - penHeight

            return (
              <G key={index}>
                {/* Collected Bar */}
                <Rect
                  x={xOffset}
                  y={colY}
                  width={totalWidth}
                  height={colHeight}
                  rx={4}
                  fill="url(#collectedGrad)"
                />
                
                {/* Pending Bar stacked on top */}
                {penHeight > 0 && (
                  <Rect
                    x={xOffset}
                    y={penY}
                    width={totalWidth}
                    height={penHeight}
                    rx={2}
                    fill="url(#pendingGrad)"
                  />
                )}

                {/* X Axis label (Month name) */}
                <SvgText
                  x={xOffset + totalWidth / 2}
                  y={paddingTop + graphHeight + 18}
                  fill="#9ca3af"
                  fontSize="10"
                  fontWeight="600"
                  textAnchor="middle"
                >
                  {item.month}
                </SvgText>
              </G>
            )
          })}
        </Svg>
      )}

      {/* Legend */}
      <View className="flex-row justify-center mt-3 space-x-6">
        <View className="flex-row items-center">
          <View className="h-3 w-3 bg-primary rounded-md mr-2" />
          <Text className="text-xs text-muted dark:text-muted-dark">Collected</Text>
        </View>
        <View className="flex-row items-center">
          <View className="h-3 w-3 bg-warning rounded-md mr-2" />
          <Text className="text-xs text-muted dark:text-muted-dark">Pending</Text>
        </View>
      </View>
    </View>
  )
}

// 2. HIGH-PERFORMANCE ANIMATED DOUGHNUT CHART
export function PaymentStatusChart({ data }: { data: PaymentStatusData[] }) {
  const { width: windowWidth } = useWindowDimensions()
  const chartWidth = Math.min(windowWidth - 48, 500)
  const size = 160
  const radius = 55
  const strokeWidth = 14
  const center = size / 2
  const circumference = 2 * Math.PI * radius

  const total = useMemo(
    () => data.reduce((acc, curr) => acc + curr.value, 0),
    [data]
  )

  let currentAngle = 0

  return (
    <View className="bg-card dark:bg-card-dark border border-border dark:border-border-dark p-4 rounded-3xl">
      <Text className="text-base font-semibold text-foreground dark:text-foreground-dark mb-4">
        This Month Status
      </Text>

      {total === 0 ? (
        <View className="h-44 items-center justify-center">
          <Text className="text-sm text-muted dark:text-muted-dark">No transactions this month</Text>
        </View>
      ) : (
        <View className="flex-row items-center justify-around h-44">
          <View className="items-center justify-center">
            <Svg width={size} height={size}>
              <G rotation="-90" origin={`${center}, ${center}`}>
                {/* Background track circle */}
                <Circle
                  cx={center}
                  cy={center}
                  r={radius}
                  stroke="rgba(156, 163, 175, 0.08)"
                  strokeWidth={strokeWidth}
                  fill="transparent"
                />

                {/* Animated sectors */}
                {data.map((item, index) => {
                  if (item.value === 0) return null

                  const percentage = item.value / total
                  const rotateAngle = currentAngle
                  currentAngle += percentage * 360

                  return (
                    <G key={index} rotation={rotateAngle} origin={`${center}, ${center}`}>
                      <Circle
                        cx={center}
                        cy={center}
                        r={radius}
                        stroke={item.color}
                        strokeWidth={strokeWidth}
                        strokeDasharray={circumference}
                        strokeDashoffset={circumference - percentage * circumference}
                        fill="transparent"
                        strokeLinecap="round"
                      />
                    </G>
                  )
                })}
              </G>
            </Svg>
            
            {/* Center total summary label */}
            <View className="absolute items-center justify-center">
              <Text className="text-xs text-muted dark:text-muted-dark uppercase tracking-wider font-semibold">Total</Text>
              <Text className="text-xl font-black text-foreground dark:text-foreground-dark">{total}</Text>
            </View>
          </View>

          {/* Legend Details */}
          <View className="space-y-3 justify-center">
            {data.map((item, index) => (
              <View key={index} className="flex-row items-center">
                <View className="h-3.5 w-3.5 rounded-full mr-3.5" style={{ backgroundColor: item.color }} />
                <View>
                  <Text className="text-xs font-semibold text-muted dark:text-muted-dark">{item.name}</Text>
                  <Text className="text-sm font-bold text-foreground dark:text-foreground-dark">
                    {item.value} ({total > 0 ? Math.round((item.value / total) * 100) : 0}%)
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  )
}
