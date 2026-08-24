"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Users, Send, CheckCircle2, XCircle, Zap, Trophy } from "lucide-react"
import { API_BASE } from "@/lib/api"
import { competitionSlug } from "@/lib/branding"

interface CompetitionStats {
  total_teams: number
  total_submissions: number
  completed_submissions: number
  failed_submissions: number
  success_rate: number
  active_tasks: number
  top_scores: { task_name: string; task_type: string; top_score: number | null }[]
}

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode
  label: string
  value: string | number
  color: string
}) {
  return (
    <Card className="p-8 text-center">
      <div className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 ${color}`}>
        {icon}
      </div>
      <div className="font-mono font-bold text-5xl mb-2">{value}</div>
      <div className="text-muted-foreground text-lg font-medium">{label}</div>
    </Card>
  )
}

export function LivestreamStats() {
  const [stats, setStats] = useState<CompetitionStats | null>(null)

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(
          `${API_BASE}/competitions/${competitionSlug}/livestream/stats`,
          { cache: "no-store" }
        )
        if (!res.ok) throw new Error("API error")
        const data = await res.json()
        setStats(data)
      } catch {}
    }
    fetchData()
  }, [])

  if (!stats) {
    return null
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-6">
        <StatCard
          icon={<Users className="w-8 h-8 text-blue-600" />}
          label="Teams"
          value={stats.total_teams}
          color="bg-blue-500/10"
        />
        <StatCard
          icon={<Send className="w-8 h-8 text-purple-600" />}
          label="Submissions"
          value={stats.total_submissions}
          color="bg-purple-500/10"
        />
        <StatCard
          icon={<CheckCircle2 className="w-8 h-8 text-green-600" />}
          label="Completed"
          value={stats.completed_submissions}
          color="bg-green-500/10"
        />
        <StatCard
          icon={<XCircle className="w-8 h-8 text-red-600" />}
          label="Failed"
          value={stats.failed_submissions}
          color="bg-red-500/10"
        />
        <StatCard
          icon={<Zap className="w-8 h-8 text-amber-600" />}
          label="Success Rate"
          value={`${stats.success_rate}%`}
          color="bg-amber-500/10"
        />
        <StatCard
          icon={<Trophy className="w-8 h-8 text-electric-blue" />}
          label="Active Tasks"
          value={stats.active_tasks}
          color="bg-electric-blue/10"
        />
      </div>

      {stats.top_scores.length > 0 && (
        <div>
          <h3 className="text-2xl font-bold mb-4 text-center">Top Scores by Task</h3>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {stats.top_scores.map((ts) => (
              <Card key={ts.task_type} className="p-8 text-center">
                <div className="text-muted-foreground text-lg font-medium mb-2">{ts.task_name}</div>
                <div className="font-mono font-bold text-5xl">
                  {ts.top_score != null ? (Number.isInteger(ts.top_score) ? ts.top_score.toString() : ts.top_score.toFixed(3)) : "-"}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
