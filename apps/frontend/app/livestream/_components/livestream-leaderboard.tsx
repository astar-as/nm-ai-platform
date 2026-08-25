"use client"

import { useEffect, useMemo, useState } from "react"
import { Trophy } from "lucide-react"

import { RankCell } from "@/components/rank-cell"
import { Card } from "@/components/ui/card"
import { API_BASE } from "@/lib/api"
import { competitionSlug } from "@/lib/branding"
import { cn } from "@/lib/utils"

interface LeaderboardEntry {
  rank: number
  team_id: string
  team_name: string
  normalized_scores: Record<string, number>
  overall_score: number
}

interface LeaderboardData {
  rankings: LeaderboardEntry[]
}

function formatScore(score: number | null | undefined): string {
  if (score == null) return "-"
  if (Number.isInteger(score)) return score.toString()
  return score.toFixed(2)
}

function label(value: string): string {
  return value
    .split(/[_-]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

export function LivestreamLeaderboard() {
  const [teams, setTeams] = useState<LeaderboardEntry[]>([])

  useEffect(() => {
    let mounted = true
    async function fetchData() {
      try {
        const response = await fetch(
          `${API_BASE}/competitions/${competitionSlug}/leaderboard/overall`,
          { cache: "no-store" },
        )
        if (!response.ok) return
        const data: LeaderboardData = await response.json()
        if (mounted && Array.isArray(data.rankings)) setTeams(data.rankings)
      } catch {}
    }
    fetchData()
    const interval = setInterval(fetchData, 30_000)
    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [])

  const taskKeys = useMemo(
    () => Object.keys(teams[0]?.normalized_scores ?? {}),
    [teams],
  )

  if (teams.length === 0) {
    return (
      <Card className="p-12 text-center">
        <Trophy className="w-16 h-16 mx-auto mb-4 text-muted-foreground/50" />
        <p className="text-2xl font-medium text-muted-foreground">No scores yet</p>
      </Card>
    )
  }

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="py-5 px-6 text-left font-semibold text-muted-foreground text-lg w-20">#</th>
              <th className="py-5 px-6 text-left font-semibold text-muted-foreground text-lg">Team</th>
              {taskKeys.map((key) => (
                <th key={key} className="py-5 px-6 text-center font-semibold text-muted-foreground text-lg w-32">
                  {label(key)}
                </th>
              ))}
              <th className="py-5 px-6 text-right font-semibold text-muted-foreground text-lg w-36">Total</th>
            </tr>
          </thead>
          <tbody>
            {teams.map((team, index) => (
              <tr
                key={team.team_id}
                className={cn("border-b last:border-0 transition-colors", index < 3 && "bg-muted/20")}
              >
                <td className="py-5 px-6"><RankCell rank={team.rank} size="lg" /></td>
                <td className="py-5 px-6"><span className="font-semibold text-xl">{team.team_name}</span></td>
                {taskKeys.map((key) => (
                  <td key={key} className="py-5 px-6 text-center font-mono text-lg">
                    {formatScore(team.normalized_scores[key])}
                  </td>
                ))}
                <td className="py-5 px-6 text-right">
                  <span className="font-mono font-bold text-2xl">{formatScore(team.overall_score)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
