"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useAuth } from "@/app/_providers/auth-provider"
import { Background } from "@/components/background"
import { Loader2 } from "lucide-react"

function AuthCallbackContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { handleAuthCallback } = useAuth()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const processCallback = async () => {
      const errorParam = searchParams.get("error")

      if (errorParam) {
        setError(errorParam)
        return
      }

      try {
        await handleAuthCallback()

        const isNewUser = searchParams.get("new") === "1"
        router.replace(isNewUser ? "/auth/setup" : "/dashboard")
      } catch {
        setError("Failed to complete authentication")
      }
    }

    processCallback()
  }, [searchParams, handleAuthCallback, router])

  if (error) {
    const isExpired = error === "expired"
    return (
      <div className="max-w-sm w-full text-center space-y-4">
        <h1 className="text-xl font-semibold text-destructive">
          {isExpired ? "Link expired" : "Login Failed"}
        </h1>
        <p className="text-muted-foreground">
          {isExpired
            ? "This magic link has expired or has already been used."
            : error}
        </p>
        <button
          onClick={() => router.replace("/")}
          className="w-full h-12 text-sm font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {isExpired ? "Send a new link" : "Back to login"}
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      <p className="text-muted-foreground">Signing you in...</p>
    </div>
  )
}

export default function AuthCallbackPage() {
  return (
    <>
      <Background />
      <main className="min-h-screen flex flex-col items-center justify-center px-4">
        <Suspense
          fallback={
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-muted-foreground">Signing you in...</p>
            </div>
          }
        >
          <AuthCallbackContent />
        </Suspense>
      </main>
    </>
  )
}
