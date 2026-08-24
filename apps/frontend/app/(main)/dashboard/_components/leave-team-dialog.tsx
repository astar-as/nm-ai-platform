"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { LogOut } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { useAuth } from "@/app/_providers/auth-provider"

export function LeaveTeamDialog() {
  const [open, setOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const { leaveTeam } = useAuth()
  const router = useRouter()

  const handleLeave = async () => {
    setIsLoading(true)
    try {
      await leaveTeam()
      toast.success("You have left the team")
      router.push("/teams")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to leave team")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" className="w-full justify-start gap-2 text-muted-foreground">
          <LogOut className="h-4 w-4" />
          Leave Team
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Leave Team</DialogTitle>
          <DialogDescription>
            Are you sure you want to leave this team? You will need an invite code to rejoin.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleLeave} disabled={isLoading}>
            {isLoading ? "Leaving..." : "Leave Team"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
