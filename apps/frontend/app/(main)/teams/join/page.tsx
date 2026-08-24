"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"

import { useAuth } from "@/app/_providers/auth-provider"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function JoinByInvitePage() {
  const router = useRouter()
  const { isAuthenticated, isLoading, joinByInvite } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const tokenRef = useRef<string | null | undefined>(undefined)
  const joinedRef = useRef(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1))
    tokenRef.current = params.get("token")
    window.history.replaceState(null, "", window.location.pathname)
  }, [])

  useEffect(() => {
    const token = tokenRef.current
    if (isLoading || token === undefined) return
    if (!token) {
      router.replace("/dashboard")
      return
    }
    if (!isAuthenticated) {
      localStorage.setItem("pending_invite_token", token)
      router.replace("/")
      return
    }
    if (joinedRef.current) return
    joinedRef.current = true

    joinByInvite(token)
      .then(() => router.replace("/dashboard?joined=1"))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to join team"))
  }, [isLoading, isAuthenticated, router, joinByInvite])

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Card className="max-w-md w-full">
          <CardHeader><CardTitle>Could not join team</CardTitle></CardHeader>
          <CardContent><p className="text-muted-foreground">{error}</p></CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  )
}
