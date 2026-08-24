"use client"

import { useState } from "react"
import { Loader2, Send } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { API_BASE } from "@/lib/api"
import { emptyFeedback, feedbackSchema, type FeedbackInput } from "@/lib/validations/feedback"
import { LikertRow } from "./likert"

interface Props {
  onSubmitted: () => void
}

export function FeedbackForm({ onSubmitted }: Props) {
  const [answers, setAnswers] = useState<FeedbackInput>(emptyFeedback)
  const [saving, setSaving] = useState(false)

  async function submit() {
    const parsed = feedbackSchema.safeParse(answers)
    if (!parsed.success) {
      toast.error("Please check the feedback fields")
      return
    }
    setSaving(true)
    try {
      const response = await fetch(`${API_BASE}/feedback`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: parsed.data }),
      })
      if (response.status === 409) {
        toast.error("Feedback has already been submitted")
        onSubmitted()
        return
      }
      if (!response.ok) throw new Error("Feedback could not be submitted")
      toast.success("Thank you for the feedback")
      onSubmitted()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Feedback could not be submitted")
    } finally {
      setSaving(false)
    }
  }

  const hasAnswer = Object.values(answers).some((value) =>
    typeof value === "string" ? value.trim().length > 0 : value != null,
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Feedback</CardTitle>
        <CardDescription>All fields are optional. Feedback can be submitted once.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <LikertRow
          label="How was the overall experience?"
          value={answers.rating}
          onChange={(rating) => setAnswers((current) => ({ ...current, rating }))}
          lowLabel="Poor"
          highLabel="Excellent"
        />
        <LikertRow
          label="How fair did the competition feel?"
          value={answers.fairness}
          onChange={(fairness) => setAnswers((current) => ({ ...current, fairness }))}
          lowLabel="Unfair"
          highLabel="Very fair"
        />
        <div className="space-y-2">
          <Label htmlFor="feedback-liked">What worked well?</Label>
          <Textarea
            id="feedback-liked"
            value={answers.liked ?? ""}
            maxLength={1000}
            onChange={(event) => setAnswers((current) => ({ ...current, liked: event.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="feedback-improve">What should improve?</Label>
          <Textarea
            id="feedback-improve"
            value={answers.improve ?? ""}
            maxLength={1000}
            onChange={(event) => setAnswers((current) => ({ ...current, improve: event.target.value }))}
          />
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="feedback-contact"
            checked={answers.contact_ok ?? false}
            onCheckedChange={(checked) =>
              setAnswers((current) => ({ ...current, contact_ok: checked === true }))
            }
          />
          <Label htmlFor="feedback-contact">The organizers may contact me about this feedback</Label>
        </div>
        {answers.contact_ok && (
          <Input
            type="email"
            placeholder="Email address"
            value={answers.contact_email ?? ""}
            onChange={(event) =>
              setAnswers((current) => ({ ...current, contact_email: event.target.value }))
            }
          />
        )}
        <Button onClick={submit} disabled={saving || !hasAnswer}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Submit feedback
        </Button>
      </CardContent>
    </Card>
  )
}
