"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Copy, Pencil, Check, X, MoreVertical, Trash2 } from "lucide-react"
import { toast } from "sonner"
import type { Team } from "@/types"
import { useAuth } from "@/app/_providers/auth-provider"
import { DeleteTeamDialog } from "./delete-team-dialog"

interface TeamCardProps {
  team: Team
  currentUserId: string
}

export function TeamCard({ team, currentUserId }: TeamCardProps) {
  const { renameTeam, inviteByEmail } = useAuth()
  const [isRenaming, setIsRenaming] = useState(false)
  const [newName, setNewName] = useState(team.name)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [email, setEmail] = useState("")
  const [isSendingInvite, setIsSendingInvite] = useState(false)
  const [showDelete, setShowDelete] = useState(false)

  const isCaptain = team.members.find((m) => m.user_id === currentUserId)?.role === "captain"

  const copyInviteCode = () => {
    navigator.clipboard.writeText(team.invite_code)
    toast.success("Invite code copied!")
  }

  const handleRename = async () => {
    const trimmed = newName.trim()
    if (!trimmed || trimmed === team.name) {
      setIsRenaming(false)
      setNewName(team.name)
      return
    }
    setIsSubmitting(true)
    try {
      await renameTeam(trimmed)
      toast.success("Team renamed!")
      setIsRenaming(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to rename team")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = email.trim()
    if (!trimmed) return
    setIsSendingInvite(true)
    try {
      await inviteByEmail(trimmed)
      toast.success(`Invite sent to ${trimmed}`)
      setEmail("")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send invite")
    } finally {
      setIsSendingInvite(false)
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            {isRenaming ? (
              <div className="flex items-center gap-2">
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="h-8 w-48"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRename()
                    if (e.key === "Escape") {
                      setIsRenaming(false)
                      setNewName(team.name)
                    }
                  }}
                  disabled={isSubmitting}
                />
                <Button variant="ghost" size="sm" onClick={handleRename} disabled={isSubmitting}>
                  <Check className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => { setIsRenaming(false); setNewName(team.name) }} disabled={isSubmitting}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <CardTitle className="text-xl">{team.name}</CardTitle>
            )}

            {isCaptain && !isRenaming && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="min-h-11 min-w-11">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setIsRenaming(true)}>
                    <Pencil className="h-4 w-4" />
                    Rename team
                  </DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onClick={() => setShowDelete(true)}>
                    <Trash2 className="h-4 w-4" />
                    Delete team
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row md:items-center gap-3">
            {isCaptain && (
              <div className="flex items-center gap-1.5">
                <span className="text-sm text-muted-foreground">Invite code:</span>
                <code className="font-mono font-bold tracking-widest text-sm">{team.invite_code}</code>
                <Button variant="ghost" size="icon" className="min-h-11 min-w-11" onClick={copyInviteCode}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            )}

            {isCaptain && (team.members.length + (team.pending_invites?.length ?? 0)) < 4 && (
              <form onSubmit={handleInvite} className="flex items-center gap-2 md:ml-auto">
                <Input
                  type="email"
                  placeholder="Invite by email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-8 w-48"
                  disabled={isSendingInvite}
                />
                <Button type="submit" size="sm" disabled={isSendingInvite || !email.trim()}>
                  {isSendingInvite ? "Sending..." : "Invite"}
                </Button>
              </form>
            )}
          </div>
        </CardContent>
      </Card>

      <DeleteTeamDialog
        teamName={team.name}
        open={showDelete}
        onOpenChange={setShowDelete}
      />
    </>
  )
}
