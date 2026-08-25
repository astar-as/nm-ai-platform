"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Download, Loader2, Trophy } from "lucide-react"
import { toast } from "sonner"
import { API_BASE } from "@/lib/api"
import { appName, appUrl } from "@/lib/branding"

interface CertData {
  participant_name: string
  team_name: string
  overall_rank: number | null
  total_teams: number
  task_placements: { task_name: string; rank: number | null; total_teams: number }[]
  certificate_code: string
}

function getBadge(rank: number, total: number): { label: string; color: string } {
  const pct = (rank / total) * 100
  if (rank <= 3) return { label: `${rank === 1 ? "1st" : rank === 2 ? "2nd" : "3rd"} Place`, color: "from-amber-400 to-yellow-500 text-black" }
  if (pct <= 1) return { label: "Top 1%", color: "from-purple-500 to-indigo-600 text-white" }
  if (pct <= 5) return { label: "Top 5%", color: "from-blue-500 to-cyan-500 text-white" }
  if (pct <= 10) return { label: "Top 10%", color: "from-emerald-500 to-teal-500 text-white" }
  if (pct <= 25) return { label: "Top 25%", color: "from-slate-400 to-slate-500 text-white" }
  return { label: "Participant", color: "from-slate-500 to-slate-600 text-white" }
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"]
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

export function CertificateCard() {
  const [data, setData] = useState<CertData | null>(null)
  const [visible, setVisible] = useState(false)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    fetch(`${API_BASE}/finals/status`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((status) => {
        if (status?.phase === "revealed") {
          setVisible(true)
          fetch(`${API_BASE}/certificate/data`, { credentials: "include" })
            .then((r) => (r.ok ? r.json() : null))
            .then((cert) => { if (cert?.certificate_code) setData(cert) })
            .catch(() => {})
        }
      })
      .catch(() => {})
  }, [])

  if (!visible || !data) return null

  const rank = data.overall_rank
  const total = data.total_teams
  const beaten = rank ? total - rank : 0
  const percentile = rank ? Math.round((1 - rank / total) * 100) : null
  const badge = rank ? getBadge(rank, total) : null
  const verifyUrl = `${appUrl}/certificate/verify/${data.certificate_code}`

  const linkedInUrl = `https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME&name=${encodeURIComponent(appName)}&organizationName=${encodeURIComponent(appName)}&certUrl=${encodeURIComponent(verifyUrl)}&certId=${encodeURIComponent(data.certificate_code)}`

  async function handleDownload() {
    setDownloading(true)
    try {
      const res = await fetch("/cert")
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error || "Failed to generate certificate")
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = res.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] || "certificate.pdf"
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to download certificate")
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Card className="border-yellow-500/20 bg-yellow-500/5">
      <CardContent className="pt-5 pb-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-widest">
            <Trophy className="h-3.5 w-3.5 text-yellow-500" />
            {appName}
          </div>
          {rank && badge && (
            <div className="flex items-center gap-2">
              <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-gradient-to-r ${badge.color}`}>
                {badge.label}
              </span>
            </div>
          )}
        </div>

        <div>
          <p className="text-xl font-bold tracking-tight">{data.participant_name}</p>
          <p className="text-sm text-muted-foreground mt-0.5">Team {data.team_name}</p>
        </div>

        {rank && (
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-background/60 border border-border/50 p-3 text-center">
              <p className="text-2xl font-bold tabular-nums">{ordinal(rank)}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Overall rank</p>
            </div>
            <div className="rounded-lg bg-background/60 border border-border/50 p-3 text-center">
              <p className="text-2xl font-bold tabular-nums">Top {percentile}%</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Percentile</p>
            </div>
            <div className="rounded-lg bg-background/60 border border-border/50 p-3 text-center">
              <p className="text-2xl font-bold tabular-nums">{beaten.toLocaleString()}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Teams beaten</p>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <Button onClick={handleDownload} disabled={downloading} size="sm" className="font-semibold">
            {downloading ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" />Generating...</>
            ) : (
              <><Download className="h-4 w-4 mr-2" />Download Certificate</>
            )}
          </Button>
          <a
            href={linkedInUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 border border-input bg-background/60 hover:bg-accent hover:text-accent-foreground px-3 py-1.5 rounded-md text-sm transition-colors"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
            </svg>
            Add to LinkedIn
          </a>
        </div>

        <div className="flex items-center justify-between text-[10px] text-muted-foreground/50 border-t border-border/40 pt-3">
          <span className="font-mono">{data.certificate_code}</span>
        </div>
      </CardContent>
    </Card>
  )
}
