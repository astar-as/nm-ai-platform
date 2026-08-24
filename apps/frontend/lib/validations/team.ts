import { z } from "zod"

export const createTeamSchema = z.object({
  name: z.string().min(2, "Team name must be at least 2 characters").max(50, "Team name too long"),
})

export const joinTeamSchema = z.object({
  inviteCode: z.string().length(8, "Invite code must be 8 characters"),
})

export type CreateTeamInput = z.infer<typeof createTeamSchema>
export type JoinTeamInput = z.infer<typeof joinTeamSchema>
