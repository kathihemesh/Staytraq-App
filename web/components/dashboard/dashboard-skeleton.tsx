import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

/**
 * First-load placeholder for the dashboard. Mirrors the exact container
 * structure, classNames, and element dimensions of the real dashboard content
 * (4 StatsCards grid, two chart cards, and the recent-activity rows) so that
 * replacing it with the loaded content introduces no layout shift.
 *
 * Rendered only on first load when no Cached_Aggregate exists (Req 12.1); the
 * matching layout/dimensions satisfy the no-shift requirement (Req 12.2, 12.3).
 */
export function DashboardSkeleton() {
  return (
    <>
      {/* Stats Cards — matches the `grid gap-4 sm:grid-cols-2 xl:grid-cols-4`
          grid of four `StatsCard`s. */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index}>
            <CardContent className="p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="mt-2 h-8 w-20 sm:h-9" />
                  <Skeleton className="mt-1.5 h-4 w-28" />
                </div>
                <Skeleton className="h-11 w-11 shrink-0 rounded-xl" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts — matches the two-column chart grid. Each card mirrors the
          chart card header (title + description) and the chart body aspect. */}
      <div className="mt-6 grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="min-w-0">
          <Card className="min-w-0 overflow-hidden">
            <CardHeader className="pb-4">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="mt-2 h-4 w-64" />
            </CardHeader>
            <CardContent className="p-2 pb-4 sm:p-6 sm:pt-0">
              <Skeleton className="aspect-[4/3] max-h-[300px] w-full" />
            </CardContent>
          </Card>
        </div>
        <div className="min-w-0">
          <Card className="min-w-0 overflow-hidden">
            <CardHeader className="pb-4">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="mt-2 h-4 w-56" />
            </CardHeader>
            <CardContent className="p-2 pb-4 sm:p-6 sm:pt-0">
              <Skeleton className="mx-auto aspect-square max-h-[300px] w-full" />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Recent Activity — matches the activity card and its divided rows. */}
      <Card className="mt-6 min-w-0 overflow-hidden">
        <CardHeader className="pb-4">
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {Array.from({ length: 5 }).map((_, index) => (
              <div
                key={index}
                className="flex items-start gap-3 px-4 py-4 sm:items-center sm:gap-4 sm:px-6"
              >
                <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                    <div className="min-w-0">
                      <Skeleton className="h-5 w-32" />
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <Skeleton className="h-5 w-20 rounded-full" />
                        <Skeleton className="h-4 w-16" />
                      </div>
                    </div>
                    <Skeleton className="mt-1 h-6 w-20 sm:mt-0" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </>
  )
}
