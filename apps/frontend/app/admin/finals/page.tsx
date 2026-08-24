"use client"

import { useState, useEffect } from "react"
import { API_BASE } from "@/lib/api"
import { ExternalLink, Loader2, Github, Box } from "lucide-react"

function linkIcon(url: string) {
  if (url.includes("github.com") || url.includes("gitlab.com")) return <Github className="w-3 h-3" />
  if (url.includes("huggingface.co")) return <Box className="w-3 h-3" />
  return <ExternalLink className="w-3 h-3" />
}

interface TeamEntry {
  rank: number
  team_id: string
  team_name: string
  team_slug: string
  overall_score: number
  raw_scores: Record<string, number | null>
  links: { url: string; label: string }[] | null
  notes: string | null
  submitted_at: string | null
}

export default function AdminFinalsPage() {
  const [teams, setTeams] = useState<TeamEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${API_BASE}/finals/admin/submissions`, {
          credentials: "include",
        })
        if (res.ok) {
          const data = await res.json()
          setTeams(data.teams || [])
        }
      } catch {
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const submittedCount = teams.filter((t) => t.links && t.links.length > 0).length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Finals Review</h1>
        <p className="text-muted-foreground text-sm">
          {submittedCount} submitted / {teams.length} total teams
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2 pr-3 font-medium">#</th>
              <th className="py-2 pr-3 font-medium">Team</th>
              <th className="py-2 pr-3 font-medium">Score</th>
              <th className="py-2 pr-3 font-medium">Links</th>
              <th className="py-2 pr-3 font-medium">Notes</th>
            </tr>
          </thead>
          <tbody>
            {teams.map((t) => (
              <tr
                key={t.team_id}
                className={`border-b ${!t.links || t.links.length === 0 ? "opacity-50" : ""}`}
              >
                <td className="py-3 pr-3 font-mono">{t.rank}</td>
                <td className="py-3 pr-3">
                  <span className="font-medium">{t.team_name}</span>
                </td>
                <td className="py-3 pr-3 font-mono">{t.overall_score}</td>
                <td className="py-3 pr-3">
                  {t.links && t.links.length > 0 ? (
                    <div className="space-y-1">
                      {t.links.map((l, i) => (
                        <a
                          key={i}
                          href={l.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-primary hover:underline"
                        >
                          {linkIcon(l.url)}
                          {l.label}
                        </a>
                      ))}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">Not submitted</span>
                  )}
                </td>
                <td className="py-3 pr-3 text-muted-foreground max-w-xs truncate">
                  {t.notes || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
