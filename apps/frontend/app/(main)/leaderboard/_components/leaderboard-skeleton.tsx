import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export function LeaderboardTableSkeleton({ columns = 3 }: { columns?: number }) {
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="py-4 px-4 w-16">
                <Skeleton className="h-4 w-6" />
              </th>
              <th className="py-4 px-4">
                <Skeleton className="h-4 w-16" />
              </th>
              {Array.from({ length: columns }).map((_, i) => (
                <th key={i} className="py-4 px-2 text-center hidden lg:table-cell">
                  <Skeleton className="h-4 w-14 mx-auto" />
                </th>
              ))}
              <th className="py-4 px-4 text-right">
                <Skeleton className="h-4 w-12 ml-auto" />
              </th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 8 }).map((_, i) => (
              <tr key={i} className="border-b last:border-0">
                <td className="py-4 px-4">
                  <Skeleton className="h-8 w-8 rounded-full" />
                </td>
                <td className="py-4 px-4">
                  <Skeleton className="h-5 w-32" />
                </td>
                {Array.from({ length: columns }).map((_, j) => (
                  <td key={j} className="py-4 px-2 text-center hidden lg:table-cell">
                    <Skeleton className="h-5 w-10 mx-auto" />
                  </td>
                ))}
                <td className="py-4 px-4 text-right">
                  <Skeleton className="h-6 w-14 ml-auto" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
