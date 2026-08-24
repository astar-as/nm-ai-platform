"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useAuth } from "@/app/_providers/auth-provider"
import { API_BASE } from "@/lib/api"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { MessageSquare, CheckCircle2 } from "lucide-react"
import { FeedbackForm } from "./_components/feedback-form"
import type { FeedbackInput } from "@/lib/validations/feedback"

interface SubmissionResponse {
  submission: {
    id: string
    answers: FeedbackInput
    created_at: string | null
    updated_at: string | null
  } | null
}

export default function FeedbackPage() {
  const { user, isLoading: authLoading } = useAuth()
  const [data, setData] = useState<SubmissionResponse | null>(null)

  useEffect(() => {
    if (authLoading || !user) return
    fetch(`${API_BASE}/feedback/me`, { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Error ${res.status}`)
        return (await res.json()) as SubmissionResponse
      })
      .then(setData)
      .catch(() => setData({ submission: null }))
  }, [user, authLoading])

  const loading = !!user && data === null

  if (authLoading || loading) {
    return (
      <div className="space-y-6 max-w-3xl mx-auto">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!user) {
    return (
      <Card className="max-w-xl mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5" /> Sign in to leave feedback
          </CardTitle>
          <CardDescription>
            The participant feedback survey is only for competitors.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href="/"
            className="btn inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 text-sm font-medium no-underline"
          >
            Sign in
          </Link>
        </CardContent>
      </Card>
    )
  }

  if (data?.submission) {
    return (
      <Card className="max-w-xl mx-auto border-emerald-500/30 bg-emerald-500/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            Thank you!
          </CardTitle>
          <CardDescription>
            You have already submitted feedback. Thank you for that.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Participant feedback</h1>
        <p className="text-muted-foreground">
          Thank you for competing. Your feedback will directly shape the next edition.
        </p>
        <p className="text-sm text-muted-foreground">
          Takes about 2 minutes. Individual answers are never shown publicly — we only publish aggregate statistics and anonymised quotes.
        </p>
      </div>
      <FeedbackForm
        onSubmitted={() =>
          setData({
            submission: {
              id: "pending",
              answers: {} as FeedbackInput,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          })
        }
      />
    </div>
  )
}
