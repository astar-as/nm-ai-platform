"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Loader2 } from "lucide-react"
import { Card } from "@/components/ui/card"
import { useAuth } from "@/app/_providers/auth-provider"
import { API_BASE } from "@/lib/api"
import { competitionSlug } from "@/lib/branding"
import { CodeUploadForm, type Quota } from "../../_components/code-upload-form"
import { SubmissionHistory } from "../../_components/submission-history"
import { TrainingDataSection } from "../../_components/training-data-section"

interface Task {
  id: string
  slug: string
  name?: string
  is_active?: boolean
  max_upload_mb?: number | null
}

function taskLabel(task: Task): string {
  if (task.name) return task.name
  return task.slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

export function SubmitClient({ slug }: { slug: string }) {
  const { isAuthenticated, isLoading: authLoading } = useAuth()
  const router = useRouter()
  const [task, setTask] = useState<Task | null>(null)
  const [quota, setQuota] = useState<Quota | null>(null)
  const [loading, setLoading] = useState(true)
  const [historyKey, setHistoryKey] = useState(0)

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/")
    }
  }, [authLoading, isAuthenticated, router])

  const fetchQuota = useCallback(async (taskId: string) => {
    try {
      const res = await fetch(`${API_BASE}/tasks/${taskId}/quota`, { credentials: "include" })
      if (res.ok) setQuota(await res.json())
    } catch {}
  }, [])

  useEffect(() => {
    let mounted = true
    async function load() {
      try {
        const res = await fetch(`${API_BASE}/competitions/${competitionSlug}/tasks`, { credentials: "include" })
        if (res.ok) {
          const tasks: Task[] = await res.json()
          const found = Array.isArray(tasks) ? tasks.find((t) => t.slug === slug) : null
          if (mounted && found) {
            setTask(found)
            fetchQuota(found.id)
          }
        }
      } catch {}
      if (mounted) setLoading(false)
    }
    load()
    return () => { mounted = false }
  }, [slug, fetchQuota])

  const handleSubmitted = useCallback(() => {
    setHistoryKey((k) => k + 1)
    if (task) fetchQuota(task.id)
  }, [task, fetchQuota])

  if (authLoading || loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!task) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <p className="text-lg font-medium text-muted-foreground">Task not found</p>
        <Link href="/tasks" className="text-sm text-muted-foreground hover:text-foreground mt-2 inline-block">
          Back to tasks
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Link href="/tasks" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors no-underline">
        <ArrowLeft className="h-4 w-4" />
        Tasks
      </Link>

      <div>
        <h1 className="text-3xl font-bold tracking-tight">{taskLabel(task)}</h1>
        <p className="text-muted-foreground mt-2">Submit your solution and track your results.</p>
      </div>

      {task.is_active === false ? (
        <Card className="p-6">
          <p className="text-sm text-muted-foreground text-center">This task is not currently open for submissions.</p>
        </Card>
      ) : (
        <>
          <TrainingDataSection taskId={task.id} />
          <CodeUploadForm
            taskId={task.id}
            maxUploadMb={task.max_upload_mb ?? undefined}
            quota={quota}
            onSubmitted={handleSubmitted}
          />
          <SubmissionHistory key={historyKey} taskId={task.id} isCodeUpload />
        </>
      )}
    </div>
  )
}
