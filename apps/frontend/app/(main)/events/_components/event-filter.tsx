"use client"

import { cn } from "@/lib/utils"

const EVENT_TYPES = [
  { value: null, label: "All" },
  { value: "kickoff", label: "Kickoff" },
  { value: "workshop", label: "Workshop" },
  { value: "stream", label: "Stream" },
  { value: "ceremony", label: "Ceremony" },
  { value: "social", label: "Social" },
] as const

interface EventFilterProps {
  selected: string | null
  onChange: (type: string | null) => void
}

export function EventFilter({ selected, onChange }: EventFilterProps) {
  return (
    <div className="flex flex-wrap gap-2 justify-center">
      {EVENT_TYPES.map((type) => (
        <button
          key={type.value ?? "all"}
          onClick={() => onChange(type.value)}
          className={cn(
            "px-4 py-1.5 rounded-full text-sm font-medium transition-all",
            selected === type.value
              ? "bg-primary text-primary-foreground shadow-md"
              : "bg-white/60 text-muted-foreground hover:bg-white/80 hover:text-foreground border border-border"
          )}
        >
          {type.label}
        </button>
      ))}
    </div>
  )
}
