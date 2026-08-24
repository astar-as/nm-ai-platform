"use client"

import { ChevronUp, ChevronDown, Info } from "lucide-react"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import type { SortDirection } from "./use-leaderboard-sort"

export function SortableHeader({
  label,
  sortKey,
  activeSortKey,
  sortDir,
  onSort,
  className,
  children,
  title,
}: {
  label?: string
  sortKey: string
  activeSortKey: string
  sortDir: SortDirection
  onSort: (key: string) => void
  className?: string
  children?: React.ReactNode
  title?: string
}) {
  const isActive = activeSortKey === sortKey

  return (
    <th
      className={cn(
        "py-4 font-semibold text-muted-foreground select-none cursor-pointer hover:text-foreground transition-colors",
        className,
      )}
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {children ?? <span className="text-xs">{label}</span>}
        {title && (
          <Tooltip>
            <TooltipTrigger asChild onClick={(e) => e.stopPropagation()}>
              <button type="button" aria-label={title} className="inline-flex text-muted-foreground/60 hover:text-muted-foreground">
                <Info className="w-3.5 h-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{title}</TooltipContent>
          </Tooltip>
        )}
        {isActive && (
          sortDir === "asc"
            ? <ChevronUp className="w-3.5 h-3.5" />
            : <ChevronDown className="w-3.5 h-3.5" />
        )}
      </span>
    </th>
  )
}
