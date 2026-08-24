"use client"

import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"

export function LeaderboardSearch({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="relative mb-4">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
      <Input
        placeholder="Search teams..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pl-9 max-w-sm"
      />
    </div>
  )
}
