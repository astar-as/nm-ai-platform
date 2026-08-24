"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowRight, Trophy, Target, Send } from "lucide-react"
import { API_BASE } from "@/lib/api"
import { competitionSlug } from "@/lib/branding"

interface Task {
  id: string
  slug: string
  name?: string
  is_active?: boolean
}

interface TaskEntry {
  rank: number
  team_id: string
  score?: number | null
  overall_score?: number | null
  total_score?: number | null
  total_submissions?: number
}

interface TaskStats {
  rank: number | null
  score: number | null
  submissions: number
}

function taskLabel(task: Task): string {
  if (task.name) return task.name
  return task.slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

export function DashboardTaskCards({ teamId, onError, retryCount }: { teamId: string; onError: (msg: string | null) => void; retryCount: number }) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [stats, setStats] = useState<Record<string, TaskStats>>({})
  const [closedForReview, setClosedForReview] = useState(false)

  useEffect(() => {
    onError(null)
    fetch(`${API_BASE}/finals/status`).then(r => r.ok ? r.json() : null).then(async (status) => {
      if (status && status.phase !== "open") {
        setClosedForReview(true)
        return
      }
      const tasksRes = await fetch(`${API_BASE}/competitions/${competitionSlug}/tasks`, { credentials: "include" })
      const taskList: Task[] = tasksRes.ok ? await tasksRes.json() : []
      if (!Array.isArray(taskList)) return
      setTasks(taskList)

      const results = await Promise.all(
        taskList.map(async (task) => {
          try {
            const res = await fetch(`${API_BASE}/competitions/${competitionSlug}/leaderboard/${task.slug}`, { credentials: "include" })
            if (!res.ok) return [task.slug, null] as const
            const data = await res.json()
            if (data?.closed_for_review) {
              setClosedForReview(true)
              return [task.slug, null] as const
            }
            const rankings: TaskEntry[] = Array.isArray(data) ? data : data.rankings || []
            const entry = rankings.find((e) => e.team_id === teamId)
            if (!entry) return [task.slug, null] as const
            return [task.slug, {
              rank: entry.rank,
              score: entry.score ?? entry.overall_score ?? entry.total_score ?? null,
              submissions: entry.total_submissions ?? 0,
            }] as const
          } catch {
            return [task.slug, null] as const
          }
        })
      )
      const next: Record<string, TaskStats> = {}
      for (const [slug, s] of results) {
        if (s) next[slug] = s
      }
      setStats(next)
    }).catch(() => { onError("Could not load your scores. The server may be temporarily unavailable.") })
  }, [teamId, retryCount, onError])

  if (closedForReview) {
    return (
      <Card className="p-8 text-center">
        <Trophy className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
        <p className="font-semibold mb-1">Competition ended</p>
        <p className="text-sm text-muted-foreground mb-3">Check the final standings on the leaderboard.</p>
        <Link href="/leaderboard" className="text-sm text-primary hover:underline">View Leaderboard</Link>
      </Card>
    )
  }

  return (
    <>
      {tasks.map((task) => {
        const s = stats[task.slug]
        return (
          <Link key={task.id} href={`/submit/${task.slug}`} className="block no-underline group">
            <Card className="transition-colors border-border/60 group-hover:border-foreground/30">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{taskLabel(task)}</CardTitle>
                  <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-muted-foreground"><Trophy className="h-3.5 w-3.5" /><span className="text-xs">Rank</span></div>
                    <p className="text-2xl font-bold font-mono">{s?.rank ? `#${s.rank}` : "—"}</p>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-muted-foreground"><Target className="h-3.5 w-3.5" /><span className="text-xs">Score</span></div>
                    <p className="text-2xl font-bold font-mono">{s?.score != null ? (Number.isInteger(s.score) ? s.score : s.score.toFixed(3)) : "—"}</p>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-muted-foreground"><Send className="h-3.5 w-3.5" /><span className="text-xs">Submissions</span></div>
                    <p className="text-2xl font-bold font-mono">{s?.submissions || "—"}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        )
      })}
    </>
  )
}
