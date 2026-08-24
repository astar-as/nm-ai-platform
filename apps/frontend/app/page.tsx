"use client"

import { useAuth } from "@/app/_providers/auth-provider"
import { useRouter } from "next/navigation"
import { Suspense, useEffect, useState, FormEvent } from "react"
import { Background } from "@/components/background"
import { ThemeToggle } from "@/components/theme-toggle"
import { Loader2 } from "lucide-react"
import { ThemeLogo } from "@/components/theme-logo"
import { API_BASE } from "@/lib/api"

export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomeContent />
    </Suspense>
  )
}

function HomeContent() {
  const { loginWithProvider, isAuthenticated, isLoading } = useAuth()
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [magicLinkLoading, setMagicLinkLoading] = useState(false)
  const [magicLinkSent, setMagicLinkSent] = useState(false)
  const [magicLinkError, setMagicLinkError] = useState<string | null>(null)

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace("/dashboard")
    }
  }, [isLoading, isAuthenticated, router])

  const handleMagicLink = async (e: FormEvent) => {
    e.preventDefault()
    setMagicLinkError(null)
    setMagicLinkLoading(true)

    try {
      const res = await fetch(`${API_BASE}/auth/magic/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })

      if (res.ok) {
        setMagicLinkSent(true)
      } else if (res.status === 429) {
        setMagicLinkError("Too many requests. Please try again later.")
      } else {
        setMagicLinkError("Something went wrong. Please try again.")
      }
    } catch {
      setMagicLinkError("Something went wrong. Please try again.")
    } finally {
      setMagicLinkLoading(false)
    }
  }

  if (isLoading || isAuthenticated) {
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
      <div className="fixed top-4 right-4 z-50">
        <ThemeToggle />
      </div>
      <main className="min-h-screen flex flex-col items-center justify-center px-4">
        <ThemeLogo width={400} height={200} className="mb-12" priority />
        <div className="w-full max-w-sm space-y-4">
          <button
            onClick={() => loginWithProvider("google")}
            disabled={isAuthenticated}
            className="w-full h-14 text-base font-semibold rounded-xl bg-background text-foreground border border-border hover:bg-muted shadow-sm flex items-center justify-center gap-3 transition-colors"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Sign in with Google
          </button>

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-sm text-muted-foreground">or</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          {magicLinkSent ? (
            <div className="text-center space-y-2">
              <p className="text-sm text-muted-foreground">
                Check your email for a login link
              </p>
              <button
                onClick={() => {
                  setMagicLinkSent(false)
                  setEmail("")
                }}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Try again
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <form onSubmit={handleMagicLink} className="flex gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email address"
                  required
                  className="flex-1 h-9 px-3 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <button
                  type="submit"
                  disabled={magicLinkLoading}
                  className="h-9 px-4 text-sm font-medium rounded-lg text-muted-foreground hover:text-foreground border border-border hover:bg-muted transition-colors disabled:opacity-50 flex items-center shrink-0"
                >
                  {magicLinkLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    "Send link"
                  )}
                </button>
              </form>
              {magicLinkError && (
                <p className="text-xs text-destructive text-center">
                  {magicLinkError}
                </p>
              )}
            </div>
          )}
        </div>
        <p className="mt-6 text-xs text-center text-muted-foreground max-w-sm">
          By signing in, you agree to our{" "}
          <a href="/privacy" className="underline underline-offset-4 hover:text-foreground transition-colors">
            privacy policy
          </a>
          .
        </p>
      </main>
    </>
  )
}
