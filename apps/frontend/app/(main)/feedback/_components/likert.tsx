"use client"

import { cn } from "@/lib/utils"

interface LikertRowProps {
  label: string
  value: number | null | undefined
  onChange: (value: number) => void
  lowLabel?: string
  highLabel?: string
}

export function LikertRow({ label, value, onChange, lowLabel = "Very poor", highLabel = "Excellent" }: LikertRowProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 md:gap-6 items-center py-2 border-b border-border/50 last:border-0">
      <div className="text-sm">{label}</div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground hidden md:inline w-16 text-right">
          {lowLabel}
        </span>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => {
            const active = value === n
            return (
              <button
                key={n}
                type="button"
                onClick={() => onChange(n)}
                aria-label={`${label} - ${n}`}
                className={cn(
                  "w-9 h-9 rounded-md border text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border hover:bg-muted hover:border-muted-foreground/40"
                )}
              >
                {n}
              </button>
            )
          })}
        </div>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground hidden md:inline w-16">
          {highLabel}
        </span>
      </div>
    </div>
  )
}
