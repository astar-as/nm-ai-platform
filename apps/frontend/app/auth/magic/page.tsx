"use client"

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"

import { Background } from "@/components/background"
import { API_BASE } from "@/lib/api"

export default function MagicLoginPage() {
  const router = useRouter()
  const [error, setError] = useState(false)

  useEffect(() => {
    async function verify() {
      const params = new URLSearchParams(window.location.hash.slice(1))
      const token = params.get("token")
      window.history.replaceState(null, "", window.location.pathname)
      if (!token) throw new Error("Missing token")
      const response = await fetch(`${API_BASE}/auth/magic/verify`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      })
        if (!response.ok) throw new Error("Login link is invalid")
        const result = await response.json()
        router.replace(`/auth/callback${result.new_user ? "?new=1" : ""}`)
    }
    verify().catch(() => setError(true))
  }, [router])

  return (
    <>
      <Background />
      <main className="min-h-screen flex flex-col items-center justify-center px-4">
        {error ? (
          <div className="max-w-sm text-center space-y-4">
            <h1 className="text-xl font-semibold text-destructive">Login link unavailable</h1>
            <p className="text-muted-foreground">This link has expired or has already been used.</p>
            <button
              onClick={() => router.replace("/")}
              className="w-full h-12 text-sm font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Request a new link
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-muted-foreground">Signing you in...</p>
          </div>
        )}
      </main>
    </>
  )
}
