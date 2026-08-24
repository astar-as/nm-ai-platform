"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import Link from "next/link"
import { Card } from "@/components/ui/card"
import { Trophy, Star } from "lucide-react"
import { LeaderboardTableSkeleton } from "./leaderboard-skeleton"
import { cn } from "@/lib/utils"
import { useAuth } from "@/app/_providers/auth-provider"
import { useLeaderboardSort } from "./use-leaderboard-sort"
import { SortableHeader } from "./sortable-header"
import { API_BASE } from "@/lib/api"
import { competitionSlug } from "@/lib/branding"
import { RankCell } from "@/components/rank-cell"

interface OverallEntry {
  rank: number
  team_id: string
  team_name: string
  team_slug: string
  normalized_scores: Record<string, number>
  overall_score: number
}

interface OverallData {
  max_scores: Record<string, number>
  rankings: OverallEntry[]
}

function ScoreCell({ value }: { value: number }) {
  if (value === 0) {
    return <span className="font-mono text-sm text-muted-foreground/30">---</span>
  }
  return <span className="font-mono text-sm">{value.toFixed(1)}</span>
}

function taskColumnLabel(key: string): string {
  return key
    .split(/[_-]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

const getTeamName = (entry: OverallEntry) => entry.team_name

const REVEAL_STYLES: Record<number, string> = {
  1: "border-l-4 border-yellow-500 bg-gradient-to-r from-yellow-500/10 to-transparent",
  2: "border-l-4 border-slate-400 bg-gradient-to-r from-slate-400/10 to-transparent",
  3: "border-l-4 border-orange-500 bg-gradient-to-r from-orange-500/10 to-transparent",
}

export function OverallLeaderboard({ isRevealed, search: externalSearch }: { isRevealed?: boolean; search?: string }) {
  const [data, setData] = useState<OverallData | null>(null)
  const [loading, setLoading] = useState(true)
  const { team } = useAuth()

  useEffect(() => {
    let mounted = true
    async function load() {
      try {
        const res = await fetch(`${API_BASE}/competitions/${competitionSlug}/leaderboard/overall`)
        if (res.ok && mounted) setData(await res.json())
      } catch {}
      if (mounted) setLoading(false)
    }
    load()
    const interval = setInterval(() => {
      if (!document.hidden) load()
    }, 30000)
    return () => { mounted = false; clearInterval(interval) }
  }, [])

  const taskKeys = useMemo(() => {
    if (!data) return []
    if (data.max_scores && Object.keys(data.max_scores).length > 0) return Object.keys(data.max_scores)
    const first = data.rankings[0]
    return first?.normalized_scores ? Object.keys(first.normalized_scores) : []
  }, [data])

  const [visibleCount, setVisibleCount] = useState(100)
  const [prevSortKey, setPrevSortKey] = useState("")
  const loadMoreRef = useRef<HTMLDivElement>(null)

  const getValue = useMemo(() => (entry: OverallEntry, key: string): number | string => {
    switch (key) {
      case "rank": return entry.rank
      case "team_name": return entry.team_name
      case "overall_score": return entry.overall_score
      default:
        if (taskKeys.includes(key)) return entry.normalized_scores?.[key] ?? 0
        return entry.rank
    }
  }, [taskKeys])

  const { sorted, sortKey, sortDir, search, toggleSort } = useLeaderboardSort(
    data?.rankings ?? [],
    "rank",
    "asc",
    getValue,
    getTeamName,
    externalSearch,
  )

  const currentSortKey = `${sortKey}-${sortDir}-${search}`
  if (currentSortKey !== prevSortKey) {
    setPrevSortKey(currentSortKey)
    setVisibleCount(100)
  }

  const visible = sorted.slice(0, visibleCount)

  useEffect(() => {
    if (!loadMoreRef.current) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisibleCount(c => c + 100) },
      { rootMargin: "200px" }
    )
    observer.observe(loadMoreRef.current)
    return () => observer.disconnect()
  }, [visibleCount, sorted.length])

  useEffect(() => {
    const handler = () => setVisibleCount(Infinity)
    window.addEventListener("expand-leaderboard", handler)
    return () => window.removeEventListener("expand-leaderboard", handler)
  }, [])

  if (loading) {
    return <LeaderboardTableSkeleton columns={4} />
  }

  if (!data || data.rankings.length === 0) {
    return (
      <Card className="p-12 text-center">
        <Trophy className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
        <p className="text-lg font-medium text-muted-foreground">No scores yet</p>
        <p className="text-sm text-muted-foreground/70">Compete in any task to appear here!</p>
      </Card>
    )
  }

  return (
    <>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                <SortableHeader sortKey="rank" activeSortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-4 text-left w-16">#</SortableHeader>
                <SortableHeader sortKey="team_name" activeSortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-4 text-left">Team</SortableHeader>
                {taskKeys.map((key) => (
                  <SortableHeader key={key} sortKey={key} activeSortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-2 text-center w-20 lg:w-28 hidden lg:table-cell" label={taskColumnLabel(key)} />
                ))}
                <SortableHeader sortKey="overall_score" activeSortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-4 text-right w-24 lg:w-32">Total</SortableHeader>
              </tr>
            </thead>
            <tbody>
              {visible.map((entry) => {
                const isMyTeam = team?.id === entry.team_id

                return (
                  <tr
                    key={entry.team_id}
                    data-team-id={entry.team_id}
                    data-team-slug={entry.team_slug}
                    className={cn(
                      "border-b last:border-0 transition-colors hover:bg-muted/30",
                      isRevealed && entry.rank <= 3 ? REVEAL_STYLES[entry.rank] : entry.rank <= 3 && "bg-muted/20",
                      isMyTeam && "bg-electric-blue/10 hover:bg-electric-blue/15"
                    )}
                  >
                    <td className="py-4 px-4">
                      <RankCell rank={entry.rank} />
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/teams/${entry.team_slug}`}
                          className={cn("font-medium hover:underline no-underline text-foreground", isRevealed && entry.rank <= 3 && "text-lg font-bold")}
                        >
                          {entry.team_name}
                        </Link>
                        {isMyTeam && <Star className="w-4 h-4 text-electric-blue fill-electric-blue" />}
                      </div>
                    </td>
                    {taskKeys.map((key) => (
                      <td key={key} className="py-4 px-2 text-center hidden lg:table-cell">
                        <ScoreCell value={entry.normalized_scores?.[key] ?? 0} />
                      </td>
                    ))}
                    <td className="py-4 px-4 text-right">
                      <span className={cn("font-mono font-bold text-lg", isRevealed && entry.rank <= 3 && "text-2xl")}>{entry.overall_score.toFixed(1)}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
      {visibleCount < sorted.length && (
        <div ref={loadMoreRef} className="flex justify-center py-4">
          <span className="text-sm text-muted-foreground">Loading more...</span>
        </div>
      )}
    </>
  )
}
