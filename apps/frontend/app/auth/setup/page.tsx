"use client"

import { useAuth } from "@/app/_providers/auth-provider"
import { useRouter } from "next/navigation"
import { useEffect, useState, FormEvent } from "react"
import { Background } from "@/components/background"
import { Loader2 } from "lucide-react"
import { ThemeLogo } from "@/components/theme-logo"
import { API_BASE } from "@/lib/api"

export default function AuthSetupPage() {
  const { user, isAuthenticated, isLoading, refreshUser } = useAuth()
  const router = useRouter()
  const [name, setName] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/")
    }
    if (!isLoading && isAuthenticated && user?.name) {
      router.replace("/dashboard")
    }
  }, [isLoading, isAuthenticated, user?.name, router])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    setSaving(true)
    setError(null)

    try {
      const res = await fetch(`${API_BASE}/users/me`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      })

      if (!res.ok) throw new Error("Failed to save")
      await refreshUser()
      router.replace("/dashboard")
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  if (isLoading || !isAuthenticated) {
    return (
      <>
        <Background />
        <main className="min-h-screen flex flex-col items-center justify-center px-4">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </main>
      </>
    )
  }

  return (
    <>
      <Background />
      <main className="min-h-screen flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-8">
          <div className="flex flex-col items-center text-center space-y-2">
            <ThemeLogo width={200} height={100} priority />
            <h1 className="text-2xl font-bold tracking-tight mt-6">Welcome!</h1>
            <p className="text-muted-foreground text-sm">
              What should we call you?
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your full name"
              required
              autoFocus
              className="w-full h-14 px-4 text-base rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="w-full h-14 text-base font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Continue"
              )}
            </button>
            {error && (
              <p className="text-sm text-destructive text-center">{error}</p>
            )}
          </form>
        </div>
      </main>
    </>
  )
}
