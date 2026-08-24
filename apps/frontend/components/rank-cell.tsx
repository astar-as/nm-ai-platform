import { cn } from "@/lib/utils"

const MEDAL_STYLES: Record<number, string> = {
  1: "bg-gradient-to-br from-yellow-400 to-amber-500 text-amber-950 shadow-lg shadow-amber-500/25",
  2: "bg-gradient-to-br from-slate-300 to-slate-400 text-slate-800 shadow-lg shadow-slate-400/25",
  3: "bg-gradient-to-br from-orange-400 to-orange-600 text-orange-950 shadow-lg shadow-orange-500/25",
}

export function RankCell({ rank, medal, size = "sm" }: { rank: number; medal?: number | null; size?: "sm" | "lg" }) {
  const medalValue = medal ?? rank
  const sizeClass = size === "lg" ? "w-12 h-12 text-lg" : "w-8 h-8 text-sm"
  const style = MEDAL_STYLES[medalValue]

  if (style) {
    return (
      <div className={cn("flex items-center justify-center rounded-full font-bold", sizeClass, style)}>
        {rank}
      </div>
    )
  }

  return (
    <div className={cn("flex items-center justify-center font-medium text-muted-foreground", sizeClass)}>
      {rank}
    </div>
  )
}
