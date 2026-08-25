"use client"

import { useState, useMemo } from "react"

export type SortDirection = "asc" | "desc"

export function useLeaderboardSort<T>(
  items: T[],
  defaultKey: string,
  defaultDir: SortDirection,
  getValue: (item: T, key: string) => number | string,
  getTeamName: (item: T) => string,
  externalSearch?: string,
) {
  const [sortKey, setSortKey] = useState(defaultKey)
  const [sortDir, setSortDir] = useState<SortDirection>(defaultDir)
  const [internalSearch, setSearch] = useState("")
  const search = externalSearch ?? internalSearch

  const sorted = useMemo(() => {
    let filtered = items
    if (search.trim()) {
      const q = search.toLowerCase()
      filtered = items.filter((item) => getTeamName(item).toLowerCase().includes(q))
    }
    return [...filtered].sort((a, b) => {
      const va = getValue(a, sortKey)
      const vb = getValue(b, sortKey)
      if (typeof va === "string" && typeof vb === "string") {
        return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va)
      }
      const na = typeof va === "number" ? va : 0
      const nb = typeof vb === "number" ? vb : 0
      return sortDir === "asc" ? na - nb : nb - na
    })
  }, [items, sortKey, sortDir, search, getValue, getTeamName])

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir(key === "team_name" ? "asc" : "desc")
    }
  }

  return { sorted, sortKey, sortDir, search, setSearch, toggleSort }
}
