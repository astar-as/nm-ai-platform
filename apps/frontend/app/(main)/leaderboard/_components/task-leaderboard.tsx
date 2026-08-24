"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Card } from "@/components/ui/card"
import { Trophy, Star } from "lucide-react"
import { LeaderboardTableSkeleton } from "./leaderboard-skeleton"
import { cn } from "@/lib/utils"
import { useAuth } from "@/app/_providers/auth-provider"
import { useLeaderboardSort } from "./use-leaderboard-sort"
import { SortableHeader } from "./sortable-header"
import { RankCell } from "@/components/rank-cell"
import { API_BASE } from "@/lib/api"
import { competitionSlug } from "@/lib/branding"

interface TaskEntry {
  rank: number
  team_id: string
  team_name: string
  team_slug?: string
  score?: number | null
  overall_score?: number | null
  total_score?: number | null
  total_submissions?: number
}

function entryScore(entry: TaskEntry): number | null {
  return entry.score ?? entry.overall_score ?? entry.total_score ?? null
}

const getValue = (entry: TaskEntry, key: string): number | string => {
  switch (key) {
    case "rank": return entry.rank
    case "team_name": return entry.team_name
    case "score": return entryScore(entry) ?? 0
    case "total_submissions": return entry.total_submissions ?? 0
    default: return entry.rank
  }
}

const getTeamName = (entry: TaskEntry) => entry.team_name

export function TaskLeaderboard({ taskSlug, search: externalSearch }: { taskSlug: string; search?: string }) {
  const [entries, setEntries] = useState<TaskEntry[]>([])
  const [loading, setLoading] = useState(true)
  const { team } = useAuth()

  useEffect(() => {
    let mounted = true
    async function load() {
      try {
        const res = await fetch(`${API_BASE}/competitions/${competitionSlug}/leaderboard/${taskSlug}`)
        if (res.ok && mounted) {
          const data = await res.json()
          const rankings = Array.isArray(data) ? data : data.rankings
          if (Array.isArray(rankings)) setEntries(rankings)
        }
      } catch {}
      if (mounted) setLoading(false)
    }
    load()
    const interval = setInterval(() => {
      if (!document.hidden) load()
    }, 30000)
    return () => { mounted = false; clearInterval(interval) }
  }, [taskSlug])

  const { sorted, sortKey, sortDir, toggleSort } = useLeaderboardSort(
    entries,
    "rank",
    "asc",
    getValue,
    getTeamName,
    externalSearch,
  )

  if (loading) {
    return <LeaderboardTableSkeleton columns={3} />
  }

  if (entries.length === 0) {
    return (
      <Card className="p-12 text-center">
        <Trophy className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
        <p className="text-lg font-medium text-muted-foreground">No scores yet</p>
        <p className="text-sm text-muted-foreground/70">Be the first to submit!</p>
      </Card>
    )
  }

  const hasSubmissions = entries.some(e => e.total_submissions != null)

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/50">
              <SortableHeader sortKey="rank" activeSortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-4 text-left w-16">#</SortableHeader>
              <SortableHeader sortKey="team_name" activeSortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-4 text-left">Team</SortableHeader>
              {hasSubmissions && (
                <SortableHeader sortKey="total_submissions" activeSortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-3 text-right w-24 hidden sm:table-cell" label="Submissions" />
              )}
              <SortableHeader sortKey="score" activeSortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-4 text-right w-24 lg:w-32">Score</SortableHeader>
            </tr>
          </thead>
          <tbody>
            {sorted.map((entry) => {
              const isMyTeam = team?.id === entry.team_id
              const score = entryScore(entry)

              return (
                <tr
                  key={entry.team_id}
                  data-team-id={entry.team_id}
                  data-team-slug={entry.team_slug}
                  className={cn(
                    "border-b last:border-0 transition-colors hover:bg-muted/30",
                    entry.rank <= 3 && "bg-muted/20",
                    isMyTeam && "bg-electric-blue/10 hover:bg-electric-blue/15"
                  )}
                >
                  <td className="py-4 px-4">
                    <RankCell rank={entry.rank} />
                  </td>
                  <td className="py-4 px-4">
                    <div className="flex items-center gap-2">
                      {entry.team_slug ? (
                        <Link
                          href={`/teams/${entry.team_slug}`}
                          className="font-medium hover:underline no-underline text-foreground"
                        >
                          {entry.team_name}
                        </Link>
                      ) : (
                        <span className="font-medium">{entry.team_name}</span>
                      )}
                      {isMyTeam && <Star className="w-4 h-4 text-electric-blue fill-electric-blue" />}
                    </div>
                  </td>
                  {hasSubmissions && (
                    <td className="py-4 px-3 text-right hidden sm:table-cell">
                      <span className="text-xs text-muted-foreground">{entry.total_submissions ?? "—"}</span>
                    </td>
                  )}
                  <td className="py-4 px-4 text-right">
                    <span className="font-mono font-bold text-lg">
                      {score != null ? (Number.isInteger(score) ? score : score.toFixed(3)) : "—"}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
