"use client"

import { useState, useEffect, useRef } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Loader2, Star } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { API_BASE } from "@/lib/api"

interface Submission {
  id: string
  status: "queued" | "processing" | "completed" | "failed"
  endpoint_url: string | null
  queued_at: string
  started_at: string | null
  completed_at: string | null
  score: number | null
  error_message: string | null
  upload_size_bytes?: number | null
  submission_type?: string
  duration_ms?: number | null
  error_type?: string | null
  is_selected_for_final?: boolean
}

const STATUS_STYLES: Record<string, string> = {
  queued: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  processing: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  completed: "bg-green-500/20 text-green-400 border-green-500/30",
  failed: "bg-red-500/20 text-red-400 border-red-500/30",
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

async function fetchSubmissionsForTask(taskId: string, isCodeUpload: boolean): Promise<Submission[] | null> {
  const endpoint = isCodeUpload
    ? `${API_BASE}/tasks/${taskId}/submissions/upload`
    : `${API_BASE}/tasks/${taskId}/submissions`
  const res = await fetch(endpoint, {
    credentials: "include",
  })
  if (!res.ok) return null
  return res.json()
}

interface SubmissionHistoryProps {
  taskId: string
  isCodeUpload?: boolean
}

export function SubmissionHistory({ taskId, isCodeUpload }: SubmissionHistoryProps) {
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [selecting, setSelecting] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollCountRef = useRef(0)

  async function handleSelectForFinal(submissionId: string) {
    setSelecting(submissionId)
    try {
      const res = await fetch(
        `${API_BASE}/tasks/${taskId}/submissions/${submissionId}/select-for-final`,
        { method: "POST", credentials: "include" }
      )
      if (!res.ok) throw new Error("Failed to select")
      const data = await fetchSubmissionsForTask(taskId, isCodeUpload ?? false)
      if (data) setSubmissions(data)
      toast.success("Selected for final evaluation")
    } catch {
      toast.error("Failed to select submission")
    } finally {
      setSelecting(null)
    }
  }

  useEffect(() => {
    let mounted = true

    async function load() {
      try {
        const data = await fetchSubmissionsForTask(taskId, isCodeUpload ?? false)
        if (mounted && data) setSubmissions(data)
      } catch {}
      if (mounted) setLoading(false)
    }

    load()
    return () => { mounted = false }
  }, [taskId, isCodeUpload])

  useEffect(() => {
    const hasActive = submissions.some(
      (s) => s.status === "queued" || s.status === "processing"
    )

    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    if (!hasActive) {
      pollCountRef.current = 0
      return
    }

    intervalRef.current = setInterval(async () => {
      pollCountRef.current += 1
      if (pollCountRef.current >= 120) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current)
          intervalRef.current = null
        }
        return
      }
      try {
        const data = await fetchSubmissionsForTask(taskId, isCodeUpload ?? false)
        if (data) setSubmissions(data)
      } catch {}
    }, 5000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [submissions, taskId, isCodeUpload])

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (submissions.length === 0) {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground text-center">
          No submissions yet. Submit your first one above.
        </p>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Submission History</h2>

      <div className="space-y-2">
        {submissions.map((sub) => (
          <Card key={sub.id} className="p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <Badge
                  variant="outline"
                  className={cn("capitalize shrink-0", STATUS_STYLES[sub.status])}
                >
                  {sub.status === "processing" && (
                    <Loader2 className="w-3 h-3 animate-spin mr-1" />
                  )}
                  {sub.status}
                </Badge>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground truncate">
                    {sub.endpoint_url || "Code upload"}
                    {sub.upload_size_bytes && (
                      <span className="ml-2">({formatSize(sub.upload_size_bytes)})</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground/60">
                    {formatTime(sub.queued_at)}
                    {sub.completed_at && ` — ${formatTime(sub.completed_at)}`}
                  </p>
                </div>
              </div>
              <div className="text-right shrink-0">
                {sub.score !== null && Number.isFinite(sub.score) ? (
                  <p className="text-sm font-mono font-medium text-green-400">
                    {sub.score.toFixed(4)}
                  </p>
                ) : sub.status === "failed" ? (
                  <p className="text-xs text-red-400 max-w-[200px] truncate">
                    {sub.error_message || "Failed"}
                  </p>
                ) : null}
                {sub.duration_ms != null && sub.status === "completed" && (
                  <p className="text-xs text-muted-foreground/60">{formatDuration(sub.duration_ms)}</p>
                )}
                {sub.error_type === "infrastructure" && (
                  <p className="text-xs text-purple-400 mt-0.5">Not counted against quota</p>
                )}
                {isCodeUpload && sub.status === "completed" && sub.score !== null && (
                  <button
                    onClick={() => handleSelectForFinal(sub.id)}
                    disabled={selecting === sub.id}
                    className={cn(
                      "text-xs px-2 py-0.5 rounded mt-1 transition-colors",
                      sub.is_selected_for_final
                        ? "bg-blue-500/20 text-blue-400 border border-blue-500/40"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    )}
                  >
                    {selecting === sub.id ? (
                      <Loader2 className="w-3 h-3 animate-spin inline" />
                    ) : sub.is_selected_for_final ? (
                      <><Star className="w-3 h-3 inline mr-1 fill-current" />Final</>
                    ) : (
                      "Select for final"
                    )}
                  </button>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
