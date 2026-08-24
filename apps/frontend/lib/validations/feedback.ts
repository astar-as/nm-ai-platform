import { z } from "zod"

const optionalText = (max: number) => z.string().max(max).optional().nullable()
const optionalRating = z.number().int().min(1).max(5).optional().nullable()

export const feedbackSchema = z.object({
  rating: optionalRating,
  fairness: optionalRating,
  liked: optionalText(1000),
  improve: optionalText(1000),
  contact_ok: z.boolean().optional().nullable(),
  contact_email: z.string().email().max(320).optional().nullable().or(z.literal("")),
})

export type FeedbackInput = z.infer<typeof feedbackSchema>

export const emptyFeedback: FeedbackInput = {}
