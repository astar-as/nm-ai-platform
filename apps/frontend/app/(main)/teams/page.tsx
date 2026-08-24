"use client"

import { useAuth } from "@/app/_providers/auth-provider"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { CreateTeamForm } from "./_components/create-team-form"
import { JoinTeamForm } from "./_components/join-team-form"
import { Button } from "@/components/ui/button"
import Link from "next/link"

export default function TeamsPage() {
  const { isAuthenticated, isLoading, team } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!isLoading && team) {
      router.push("/dashboard")
    }
  }, [isLoading, team, router])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold mb-4">Join the Competition</h1>
        <p className="text-muted-foreground mb-6">
          Sign in to create or join a team
        </p>
        <Button asChild>
          <Link href="/" className="no-underline">
            Sign in
          </Link>
        </Button>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Join the Competition</h1>
        <p className="text-muted-foreground mt-2">
          Create a new team or join an existing one
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <CreateTeamForm />
        <JoinTeamForm />
      </div>
    </div>
  )
}
