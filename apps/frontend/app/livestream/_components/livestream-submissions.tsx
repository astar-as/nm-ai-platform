"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Send } from "lucide-react"
import { StatusIcon } from "@/components/status-icon"
import { API_BASE } from "@/lib/api"
import { competitionSlug } from "@/lib/branding"

interface RecentSubmission {
  id: string
  team_name: string
  task_name: string
  submission_mode: string
  status: string
  score: number | null
  queued_at: string | null
  completed_at: string | null
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return ""
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ago`
}



function StatusBadge({ status }: { status: string }) {
  const variant = status === "completed"
    ? "default"
    : status === "failed"
      ? "destructive"
      : "secondary"
  return (
    <Badge variant={variant} className="text-sm px-3 py-1">
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  )
}

export function LivestreamSubmissions() {
  const [submissions, setSubmissions] = useState<RecentSubmission[]>([])

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(
          `${API_BASE}/competitions/${competitionSlug}/livestream/recent`,
          { cache: "no-store" }
        )
        if (!res.ok) throw new Error("API error")
        const data = await res.json()
        setSubmissions(data)
      } catch {}
    }
    fetchData()
  }, [])

  if (submissions.length === 0) {
    return (
      <Card className="p-12 text-center">
        <Send className="w-16 h-16 mx-auto mb-4 text-muted-foreground/50" />
        <p className="text-2xl font-medium text-muted-foreground">No submissions yet</p>
        <p className="text-lg text-muted-foreground/70 mt-2">Waiting for teams to submit...</p>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {submissions.map((sub) => (
        <Card key={sub.id} className="p-6">
          <div className="flex items-center gap-6">
            <StatusIcon status={sub.status} size="md" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-1">
                <span className="font-bold text-xl truncate">{sub.team_name}</span>
                <Badge variant="outline" className="text-sm shrink-0">
                  {sub.submission_mode}
                </Badge>
              </div>
              <p className="text-muted-foreground text-lg">{sub.task_name}</p>
            </div>
            <div className="flex items-center gap-6 shrink-0">
              {sub.score != null && (
                <span className="font-mono font-bold text-2xl text-green-500">
                  {Number.isInteger(sub.score) ? sub.score.toString() : sub.score.toFixed(3)}
                </span>
              )}
              <StatusBadge status={sub.status} />
              <span className="text-muted-foreground text-base w-20 text-right">
                {timeAgo(sub.queued_at)}
              </span>
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}
