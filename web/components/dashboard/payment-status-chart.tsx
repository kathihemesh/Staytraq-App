"use client"

import { Cell, Pie, PieChart, Legend } from "recharts"
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

export interface PaymentStatusData {
  name: string
  value: number
  color: string
}

interface PaymentStatusChartProps {
  data: PaymentStatusData[]
}

export function PaymentStatusChart({ data }: PaymentStatusChartProps) {
  return (
    <Card className="min-w-0 overflow-hidden transition-shadow hover:shadow-md">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg font-semibold">Payment Status</CardTitle>
        <CardDescription>Current month payment breakdown</CardDescription>
      </CardHeader>
      <CardContent className="p-2 pb-4 sm:p-6 sm:pt-0">
        <ChartContainer
          config={{
            paid: {
              label: "Paid",
              color: "var(--color-success)",
            },
            pending: {
              label: "Pending",
              color: "var(--color-warning)",
            },
            late: {
              label: "Late",
              color: "var(--color-destructive)",
            },
          }}
          className="mx-auto aspect-square w-full max-h-[300px]"
        >
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius="35%"
              outerRadius="55%"
              paddingAngle={2}
              dataKey="value"
              label={({ name, percent, cx, cy, midAngle, outerRadius }) => {
                const RADIAN = Math.PI / 180;
                const radius = Number(outerRadius) * 1.35;
                const x = Number(cx) + radius * Math.cos(-midAngle * RADIAN);
                const y = Number(cy) + radius * Math.sin(-midAngle * RADIAN);
                return (
                  <text
                    x={x}
                    y={y}
                    textAnchor={x > Number(cx) ? "start" : "end"}
                    dominantBaseline="central"
                    className="fill-foreground text-xs font-medium"
                  >
                    {`${name} ${(percent * 100).toFixed(0)}%`}
                  </text>
                );
              }}
              labelLine={false}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value) => `${value} tenants`}
                />
              }
            />
            <Legend 
              verticalAlign="bottom"
              height={36}
              iconType="circle"
              formatter={(value) => <span className="text-sm text-foreground">{value}</span>}
            />
          </PieChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
