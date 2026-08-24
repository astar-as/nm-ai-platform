"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Loader2, ArrowLeft, Trophy } from "lucide-react"
import Link from "next/link"
import { API_BASE } from "@/lib/api"
import { competitionSlug } from "@/lib/branding"

interface TeamMember {
  name: string
  avatar_url: string | null
  role: string
}

interface PublicTeam {
  id: string
  name: string
  slug: string
  members: TeamMember[]
}

interface OverallEntry {
  rank: number
  team_id: string
  team_name: string
  normalized_scores: Record<string, number>
  overall_score: number
}

function scoreLabel(key: string): string {
  return key
    .split(/[_-]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <div className="flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-br from-yellow-400 to-amber-500 text-amber-950 font-bold text-xl shadow-lg shadow-amber-500/25">
        {rank}
      </div>
    )
  }
  if (rank === 2) {
    return (
      <div className="flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-br from-slate-300 to-slate-400 text-slate-800 font-bold text-xl shadow-lg shadow-slate-400/25">
        {rank}
      </div>
    )
  }
  if (rank === 3) {
    return (
      <div className="flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 text-orange-950 font-bold text-xl shadow-lg shadow-orange-500/25">
        {rank}
      </div>
    )
  }
  return (
    <div className="flex items-center justify-center w-12 h-12 rounded-full bg-muted text-muted-foreground font-bold text-xl">
      {rank}
    </div>
  )
}

export default function TeamPageClient({ slug }: { slug: string }) {
  const [team, setTeam] = useState<PublicTeam | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [overallEntry, setOverallEntry] = useState<OverallEntry | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${API_BASE}/teams/by-slug/${slug}`)
        if (res.status === 404) {
          setNotFound(true)
          setLoading(false)
          return
        }
        if (res.ok) {
          const teamData: PublicTeam = await res.json()
          setTeam(teamData)

          const overallRes = await fetch(`${API_BASE}/competitions/${competitionSlug}/leaderboard/overall`).catch(() => null)
          if (overallRes?.ok) {
            const data = await overallRes.json()
            const entry = data.rankings?.find((e: OverallEntry) => e.team_id === teamData.id)
            if (entry) setOverallEntry(entry)
          }
        }
      } catch {
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [slug])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (notFound || !team) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <p className="text-lg font-medium text-muted-foreground">Team not found</p>
        <Link href="/leaderboard" className="text-sm text-muted-foreground hover:text-foreground mt-2 inline-block">
          Back to leaderboard
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Link href="/leaderboard" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors no-underline">
        <ArrowLeft className="h-4 w-4" />
        Leaderboard
      </Link>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <CardTitle className="text-2xl">{team.name}</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">{team.members.length} member{team.members.length !== 1 ? "s" : ""}</p>
            </div>
            {overallEntry && (
              <div className="flex flex-col items-center gap-1">
                <RankBadge rank={overallEntry.rank} />
                <span className="text-xs text-muted-foreground font-medium">Overall</span>
              </div>
            )}
          </div>
        </CardHeader>

        {overallEntry && (
          <CardContent className="pt-0 pb-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <div className="font-mono font-bold text-2xl">{overallEntry.overall_score.toFixed(1)}</div>
                <div className="text-xs text-muted-foreground mt-0.5">Overall Score</div>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {overallEntry && Object.keys(overallEntry.normalized_scores || {}).length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Trophy className="h-4 w-4" />
              Task Scores
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              {(Object.entries(overallEntry.normalized_scores) as [string, number][]).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between p-3 rounded-lg border">
                  <span className="text-sm font-medium">{scoreLabel(key)}</span>
                  <div className="flex items-center gap-2">
                    {value > 0 ? (
                      <span className="font-mono font-bold">{value.toFixed(1)}</span>
                    ) : (
                      <span className="font-mono text-muted-foreground/40">---</span>
                    )}
                    <div className="w-16 h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-foreground/70"
                        style={{ width: `${Math.min(100, value)}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Members</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
            {team.members.map((member) => {
              const initials = (member.name || "?")
                .split(" ")
                .map((n) => n[0])
                .join("")
                .toUpperCase()
                .slice(0, 2)

              return (
                <div key={member.name} className="flex items-center gap-4 py-3 border-b border-border/50 last:border-0">
                  <Avatar className="h-12 w-12">
                    {member.avatar_url && <AvatarImage src={member.avatar_url} alt={member.name} />}
                    <AvatarFallback className="bg-muted text-sm">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate">{member.name}</p>
                      {member.role === "captain" && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Captain</span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
