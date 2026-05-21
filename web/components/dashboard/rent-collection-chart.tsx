"use client"

import {
  Bar,
  BarChart,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"

export interface RentCollectionData {
  month: string
  collected: number
  pending: number
}

interface RentCollectionChartProps {
  data: RentCollectionData[]
}

export function RentCollectionChart({ data }: RentCollectionChartProps) {
  return (
    <Card className="min-w-0 overflow-hidden transition-shadow hover:shadow-md">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg font-semibold">Monthly Rent Collection</CardTitle>
        <CardDescription>
          Collected vs pending rent over the last 6 months
        </CardDescription>
      </CardHeader>
      <CardContent className="p-2 pb-4 sm:p-6 sm:pt-0">
        <ChartContainer
          config={{
            collected: {
              label: "Collected",
              color: "var(--color-success)",
            },
            pending: {
              label: "Pending",
              color: "var(--color-warning)",
            },
          }}
          className="aspect-[4/3] w-full max-h-[300px]"
        >
          <BarChart
            data={data}
            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
          >
            <CartesianGrid 
              strokeDasharray="3 3" 
              className="stroke-border" 
              vertical={false}
              stroke="currentColor"
              strokeOpacity={0.1}
            />
            <XAxis
              dataKey="month"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: "currentColor", fillOpacity: 0.7 }}
              tickMargin={8}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: "currentColor", fillOpacity: 0.7 }}
              tickFormatter={(value) => `₹${value / 1000}k`}
              width={45}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value) => `₹${Number(value).toLocaleString()}`}
                />
              }
            />
            <Bar
              dataKey="collected"
              fill="var(--color-collected)"
              radius={[4, 4, 0, 0]}
            />
            <Bar
              dataKey="pending"
              fill="var(--color-pending)"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
