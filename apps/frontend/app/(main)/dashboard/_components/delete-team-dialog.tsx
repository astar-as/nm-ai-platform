"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import { useAuth } from "@/app/_providers/auth-provider"

interface DeleteTeamDialogProps {
  teamName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DeleteTeamDialog({ teamName, open, onOpenChange }: DeleteTeamDialogProps) {
  const { deleteTeam } = useAuth()
  const [confirmation, setConfirmation] = useState("")
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      await deleteTeam()
      toast.success("Team deleted")
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete team")
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setConfirmation(""); onOpenChange(v) }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete team</DialogTitle>
          <DialogDescription>
            This action cannot be undone. All members will be removed from the team.
            Type <strong>{teamName}</strong> to confirm.
          </DialogDescription>
        </DialogHeader>
        <Input
          placeholder="Type team name to confirm"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          disabled={isDeleting}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isDeleting}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={confirmation !== teamName || isDeleting}
          >
            {isDeleting ? "Deleting..." : "Delete team"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
