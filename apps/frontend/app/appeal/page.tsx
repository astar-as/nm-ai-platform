"use client"

import { useState, useEffect } from "react"
import { Background } from "@/components/background"
import { ThemeToggle } from "@/components/theme-toggle"
import { ShieldAlert, LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ThemeLogo } from "@/components/theme-logo"
import { supportEmail } from "@/lib/branding"

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8003"

interface BanState {
  loading: boolean
  reason: string | null
}

export default function AppealPage() {
  const [ban, setBan] = useState<BanState>({ loading: true, reason: null })

  useEffect(() => {
    fetch(`${API_BASE}/auth/ban-check`, { credentials: "include" })
      .then(async (res) => {
        if (res.status === 403) {
          const data = await res.json().catch(() => ({}))
          setBan({ loading: false, reason: data?.detail?.reason || "Policy violation" })
        } else {
          window.location.replace("/dashboard")
        }
      })
      .catch(() => {
        setBan({ loading: false, reason: "Unable to verify ban status" })
      })
  }, [])

  const handleLogout = async () => {
    try {
      await fetch(`${API_BASE}/auth/logout`, { method: "POST", credentials: "include" })
    } catch {}
    window.location.replace("/")
  }

  if (ban.loading) return null

  return (
    <>
      <Background />
      <div className="fixed top-4 right-4 z-50">
        <ThemeToggle />
      </div>
      <main className="min-h-screen flex flex-col items-center justify-center px-4">
        <div className="mb-8">
          <ThemeLogo width={200} height={100} priority />
        </div>

        <div className="w-full max-w-md space-y-6 text-center">
          <div className="flex items-center justify-center gap-3">
            <ShieldAlert className="w-8 h-8 text-red-400" />
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
              Account Suspended
            </h1>
          </div>

          <div className="p-4 rounded-lg bg-red-500/5 border border-red-500/20 text-left">
            <p className="text-sm font-medium text-red-400 mb-1">Reason</p>
            <p className="text-sm text-red-400/80">{ban.reason}</p>
          </div>

          <div className="space-y-2 text-sm text-muted-foreground">
            <p>Your account has been suspended due to a policy violation.</p>
            <p>
              To appeal this decision, please contact{" "}
              <a
                href={`mailto:${supportEmail}?subject=Appeal`}
                className="text-foreground underline underline-offset-4 hover:text-primary transition-colors"
              >
                {supportEmail}
              </a>
            </p>
          </div>

          <Button
            variant="ghost"
            className="text-muted-foreground hover:text-foreground"
            onClick={handleLogout}
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sign out
          </Button>
        </div>
      </main>
    </>
  )
}
