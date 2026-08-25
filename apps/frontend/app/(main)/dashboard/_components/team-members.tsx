"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { MoreVertical, Shield, UserMinus, Users, Mail, X } from "lucide-react"
import { toast } from "sonner"
import type { TeamMember, PendingInvite } from "@/types"
import { useAuth } from "@/app/_providers/auth-provider"
import { LeaveTeamDialog } from "./leave-team-dialog"
import { API_BASE } from "@/lib/api"

interface TeamMembersProps {
  members: TeamMember[]
  pendingInvites: PendingInvite[]
  teamId: string
  currentUserId: string
}

export function TeamMembers({ members, pendingInvites, teamId, currentUserId }: TeamMembersProps) {
  const { refreshTeam, revokeInvite, transferCaptain } = useAuth()
  const currentMember = members.find((m) => m.user_id === currentUserId)
  const isCaptain = currentMember?.role === "captain"
  const [removing, setRemoving] = useState<TeamMember | null>(null)
  const [transferring, setTransferring] = useState<TeamMember | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)

  const removeMember = async () => {
    if (!removing) return

    setIsLoading(true)
    try {
      const res = await fetch(`${API_BASE}/teams/${teamId}/members/${removing.user_id}`, {
        method: "DELETE",
        credentials: "include",
      })

      if (!res.ok) throw new Error("Failed to remove member")

      await refreshTeam()
      toast.success("Member removed")
      setRemoving(null)
    } catch {
      toast.error("Failed to remove member")
    } finally {
      setIsLoading(false)
    }
  }

  const handleTransfer = async () => {
    if (!transferring) return
    setIsLoading(true)
    try {
      await transferCaptain(transferring.user_id)
      toast.success(`${transferring.name || transferring.email} is now the captain`)
      setTransferring(null)
    } catch {
      toast.error("Failed to transfer captainship")
    } finally {
      setIsLoading(false)
    }
  }

  const handleRevoke = async (invite: PendingInvite) => {
    setRevokingId(invite.id)
    try {
      await revokeInvite(invite.id)
      toast.success(`Invite to ${invite.email} revoked`)
    } catch {
      toast.error("Failed to revoke invite")
    } finally {
      setRevokingId(null)
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="h-5 w-5" />
            Team Members
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {members.map((member) => {
              const initials = (member.name || member.email.split("@")[0])
                .split(" ")
                .map((n) => n[0])
                .join("")
                .toUpperCase()
                .slice(0, 2)

              return (
                <div key={member.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      {member.avatar_url && <AvatarImage src={member.avatar_url} alt={member.name} />}
                      <AvatarFallback className="text-xs">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-medium text-sm flex items-center gap-1">
                        {member.name || member.email.split("@")[0]}
                      </div>
                      <div className="text-xs text-muted-foreground">{member.email}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {member.role === "captain" ? (
                      <Badge variant="outline">Captain</Badge>
                    ) : isCaptain && member.user_id !== currentUserId ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="min-h-11 min-w-11">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setTransferring(member)}>
                            <Shield className="h-4 w-4 mr-2" />
                            Make captain
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => setRemoving(member)}
                          >
                            <UserMinus className="h-4 w-4 mr-2" />
                            Remove
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </div>
                </div>
              )
            })}

            {pendingInvites.map((invite) => (
              <div key={invite.id} className="flex items-center justify-between opacity-50">
                <div className="flex items-center gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="text-xs">
                      <Mail className="h-3.5 w-3.5" />
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="font-medium text-sm">{invite.email}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">Invited</Badge>
                  {isCaptain && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="min-h-11 min-w-11"
                      onClick={() => handleRevoke(invite)}
                      disabled={revokingId === invite.id}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
          {!isCaptain && (
            <div className="mt-4 pt-4 border-t">
              <LeaveTeamDialog />
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!removing} onOpenChange={(open) => !open && setRemoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove member</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove {removing?.name || removing?.email} from the team?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(null)} disabled={isLoading}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={removeMember} disabled={isLoading}>
              {isLoading ? "Removing..." : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!transferring} onOpenChange={(open) => !open && setTransferring(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transfer captainship</DialogTitle>
            <DialogDescription>
              Make {transferring?.name || transferring?.email} the new captain? You will become a regular member.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferring(null)} disabled={isLoading}>
              Cancel
            </Button>
            <Button onClick={handleTransfer} disabled={isLoading}>
              {isLoading ? "Transferring..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
