"use client"

import { useState, useEffect, useCallback } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { useAuth } from "@/app/_providers/auth-provider"
import { API_BASE } from "@/lib/api"
import {
  Clock,
  Lock,
  Trophy,
  Plus,
  Trash2,
  Check,
  AlertTriangle,
  ExternalLink,
  Loader2,
  Github,
  Box,
} from "lucide-react"

function linkIcon(url: string) {
  if (url.includes("github.com") || url.includes("gitlab.com")) return <Github className="w-4 h-4 text-muted-foreground" />
  if (url.includes("huggingface.co")) return <Box className="w-4 h-4 text-muted-foreground" />
  return <ExternalLink className="w-4 h-4 text-muted-foreground" />
}

function linkLabel(url: string) {
  if (url.includes("github.com")) return "GitHub"
  if (url.includes("gitlab.com")) return "GitLab"
  if (url.includes("huggingface.co")) return "HuggingFace"
  return null
}

interface FinalsStatus {
  phase: "open" | "grace" | "closed"
  competition_end: string
  repo_deadline: string
}

interface LinkItem {
  url: string
  label: string
}

interface FinalSubmission {
  id: string
  links: LinkItem[]
  notes: string | null
  created_at: string | null
  updated_at: string | null
}

function Countdown({ target, label }: { target: string; label: string }) {
  const [remaining, setRemaining] = useState("")

  useEffect(() => {
    const update = () => {
      const diff = new Date(target).getTime() - Date.now()
      if (diff <= 0) {
        setRemaining("00:00:00")
        return
      }
      const h = Math.floor(diff / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      setRemaining(
        `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
      )
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [target])

  return (
    <div className="text-center">
      <p className="text-sm text-muted-foreground mb-2">{label}</p>
      <p className="text-5xl font-mono font-bold tracking-wider tabular-nums">
        {remaining}
      </p>
    </div>
  )
}

const TIMELINE_STEPS = [
  {
    time: "Close",
    title: "Competition closes",
    desc: "All task submissions stop accepting. Make your repository public. Last commit must be before the deadline.",
  },
  {
    time: "Grace",
    title: "Repository link deadline",
    desc: "A short grace period after close to submit your repository links. After this, links are locked.",
  },
  {
    time: "Review",
    title: "Review begins",
    desc: "The jury reviews code repositories starting from the top of the leaderboard.",
  },
  {
    time: "Reveal",
    title: "Winners announced",
    desc: "The final podium is revealed. Exact time depends on review progress.",
  },
  {
    time: "After",
    title: "Certificates",
    desc: "All participants can download a certificate of participation.",
  },
]

function Timeline({ phase }: { phase: "open" | "grace" | "closed" }) {
  const activeIdx = phase === "open" ? 0 : phase === "grace" ? 1 : 3

  return (
    <div className="relative pl-8">
      <div className="absolute left-3 top-2 bottom-2 w-px bg-border" />
      {TIMELINE_STEPS.map((step, i) => {
        const isPast = i < activeIdx
        const isCurrent = i === activeIdx
        return (
          <div key={i} className="relative mb-8 last:mb-0">
            <div
              className={`absolute -left-5 top-1 w-3 h-3 rounded-full border-2 ${
                isPast
                  ? "bg-emerald-500 border-emerald-500"
                  : isCurrent
                    ? "bg-primary border-primary animate-[pulse_1.5s_ease-in-out_infinite]"
                    : "bg-background border-muted-foreground/40"
              }`}
            />
            <div className="flex items-center gap-2 mb-1">
              <Badge
                variant={isPast ? "default" : isCurrent ? "default" : "secondary"}
                className={`font-mono text-xs ${isPast ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30" : ""}`}
              >
                {step.time}{step.time.includes(":") ? " CET" : ""}
              </Badge>
              {isPast && <Check className="w-4 h-4 text-emerald-500" />}
            </div>
            <h3 className="font-semibold">{step.title}</h3>
            <p className="text-sm text-muted-foreground">{step.desc}</p>
          </div>
        )
      })}
    </div>
  )
}

function LinkForm({
  submission,
  isCaptain,
  phase,
  onSaved,
}: {
  submission: FinalSubmission | null
  isCaptain: boolean
  phase: "open" | "grace" | "closed"
  onSaved: () => void
}) {
  const [links, setLinks] = useState<LinkItem[]>(
    submission?.links?.length ? submission.links : [{ url: "", label: "" }]
  )
  const [notes, setNotes] = useState(submission?.notes || "")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (submission?.links?.length) {
      setLinks(submission.links)
      setNotes(submission.notes || "")
    }
  }, [submission])

  const canEdit = isCaptain && phase !== "closed"

  const addLink = () => {
    if (links.length < 5) setLinks([...links, { url: "", label: "" }])
  }

  const removeLink = (idx: number) => {
    if (links.length > 1) setLinks(links.filter((_, i) => i !== idx))
  }

  const updateLink = (idx: number, field: "url" | "label", value: string) => {
    const next = [...links]
    next[idx] = { ...next[idx], [field]: value }
    setLinks(next)
  }

  const handleSave = async () => {
    const validLinks = links.filter((l) => l.url.trim() && l.label.trim())
    if (validLinks.length === 0) {
      toast.error("At least one link with a URL and label is required.")
      return
    }
    for (const l of validLinks) {
      if (!l.url.startsWith("https://")) {
        toast.error(`URL must start with https://: ${l.url}`)
        return
      }
    }

    setSaving(true)
    try {
      const res = await fetch(`${API_BASE}/finals/submission`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ links: validLinks, notes: notes || null }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.detail || `Error ${res.status}`)
      }
      toast.success("Final submission saved!")
      onSaved()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  if (!isCaptain) {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="w-5 h-5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Only the team captain can submit final links.
          </p>
        </div>
        {submission && submission.links.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Your team&apos;s submission:</p>
            {submission.links.map((l, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                {linkIcon(l.url)}
                <a
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  {l.label}
                </a>
                {linkLabel(l.url) && <span className="text-xs text-muted-foreground">({linkLabel(l.url)})</span>}
              </div>
            ))}
          </div>
        )}
      </Card>
    )
  }

  if (phase === "closed" && submission) {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Lock className="w-5 h-5 text-muted-foreground" />
          <p className="font-medium">Final submission locked</p>
        </div>
        <div className="space-y-2">
          {submission.links.map((l, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              {linkIcon(l.url)}
              <a
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                {l.label}
              </a>
              {linkLabel(l.url) && <span className="text-xs text-muted-foreground">({linkLabel(l.url)})</span>}
            </div>
          ))}
          {submission.notes && (
            <p className="text-sm text-muted-foreground mt-2">{submission.notes}</p>
          )}
        </div>
      </Card>
    )
  }

  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold mb-4">Your Repository Links</h2>
      <div className="space-y-4">
        {links.map((link, i) => (
          <div key={i} className="flex gap-2 items-start">
            <div className="flex-1 space-y-2">
              <Input
                placeholder="https://github.com/your-team/repo"
                value={link.url}
                onChange={(e) => updateLink(i, "url", e.target.value)}
                disabled={!canEdit}
              />
              <Input
                placeholder="Label (e.g. source code or model weights)"
                value={link.label}
                onChange={(e) => updateLink(i, "label", e.target.value)}
                disabled={!canEdit}
              />
            </div>
            {canEdit && links.length > 1 && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeLink(i)}
                className="mt-1"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        ))}
        {canEdit && links.length < 5 && (
          <Button variant="outline" size="sm" onClick={addLink}>
            <Plus className="w-4 h-4 mr-1" />
            Add another link
          </Button>
        )}
        <div>
          <label className="text-sm font-medium mb-1 block">Notes (optional)</label>
          <textarea
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            rows={2}
            placeholder="Describe what each link contains and any review instructions..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={!canEdit}
          />
        </div>
        {canEdit && (
          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : submission ? (
              "Update Final Submission"
            ) : (
              "Save Final Submission"
            )}
          </Button>
        )}
      </div>
      <div className="mt-4 p-3 rounded-md bg-muted text-sm text-muted-foreground space-y-1">
        <p>Must be GitHub, GitLab, HuggingFace, or similar hosting.</p>
        <p>Keep repositories private until the competition closes, then make them public.</p>
        <p className="font-medium text-foreground">
          Last commit must be timestamped before the deadline.
        </p>
      </div>
    </Card>
  )
}

export default function FinalsPage() {
  const { user, team, isLoading: authLoading } = useAuth()
  const [status, setStatus] = useState<FinalsStatus | null>(null)
  const [submission, setSubmission] = useState<FinalSubmission | null>(null)
  const [isCaptain, setIsCaptain] = useState(false)
  const [loading, setLoading] = useState(true)

  const fetchSubmission = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/finals/submission`, {
        credentials: "include",
      })
      if (res.ok) {
        const data = await res.json()
        setSubmission(data.submission)
        setIsCaptain(data.is_captain)
      }
    } catch {}
  }, [])

  useEffect(() => {
    let mounted = true
    async function load() {
      try {
        const [statusRes, subRes] = await Promise.all([
          fetch(`${API_BASE}/finals/status`),
          fetch(`${API_BASE}/finals/submission`, { credentials: "include" }),
        ])
        if (!mounted) return
        if (statusRes.ok) setStatus(await statusRes.json())
        if (subRes.ok) {
          const data = await subRes.json()
          setSubmission(data.submission)
          setIsCaptain(data.is_captain)
        }
      } catch {}
      if (mounted) setLoading(false)
    }
    load()
    const id = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/finals/status`)
        if (res.ok && mounted) setStatus(await res.json())
      } catch {}
    }, 10_000)
    return () => {
      mounted = false
      clearInterval(id)
    }
  }, [])

  if (loading || authLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const phase = status?.phase || "open"

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Finals</h1>
        <p className="text-muted-foreground">
          Competition closing procedure and final code submission
        </p>
      </div>

      <Card className="p-6">
        {phase === "open" && status && (
          <Countdown target={status.competition_end} label="Competition closes in" />
        )}
        {phase === "grace" && status && (
          <div className="space-y-3">
            <div className="flex items-center justify-center gap-2 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="w-5 h-5" />
              <p className="font-semibold">Competition has ended!</p>
            </div>
            <Countdown
              target={status.repo_deadline}
              label="Repository link deadline in"
            />
            <p className="text-center text-sm text-muted-foreground">
              Submit your repository links now. Make your repos public.
            </p>
          </div>
        )}
        {phase === "closed" && (
          <div className="flex flex-col items-center gap-3 py-4">
            <Lock className="w-8 h-8 text-muted-foreground" />
            <p className="font-semibold text-lg">Submissions closed</p>
            <p className="text-sm text-muted-foreground">
              Jury review in progress. Winners will be announced soon.
            </p>
          </div>
        )}
      </Card>

      <div>
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <Clock className="w-5 h-5" />
          Timeline
        </h2>
        <Timeline phase={phase} />
      </div>

      {!authLoading && user && team && (
        <div>
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Trophy className="w-5 h-5" />
            Final Submission
          </h2>
          <LinkForm
            submission={submission}
            isCaptain={isCaptain}
            phase={phase}
            onSaved={fetchSubmission}
          />
        </div>
      )}

      {!authLoading && (!user || !team) && (
        <Card className="p-6 text-center text-muted-foreground">
          <p>Log in and join a team to submit your final links.</p>
        </Card>
      )}
    </div>
  )
}
