"use client"

import { Suspense } from "react"
import dynamic from "next/dynamic"
import { useAuth } from "@/app/_providers/auth-provider"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ArrowUpRight, AlertTriangle, RefreshCw } from "lucide-react"
import { TeamCard } from "./team-card"
import { TeamMembers } from "./team-members"
import { ShareModal } from "./share-modal"
import { CreateTeamForm } from "../../teams/_components/create-team-form"
import { JoinTeamForm } from "../../teams/_components/join-team-form"
import { JoinedBanner } from "./joined-banner"
import { CertificateCard } from "./certificate-card"
import { appName } from "@/lib/branding"

const DashboardTaskCards = dynamic(() => import("./dashboard-task-cards").then(m => ({ default: m.DashboardTaskCards })))

const SLACK_INVITE_URL = process.env.NEXT_PUBLIC_SLACK_INVITE_URL || ""

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-5 w-24 mt-2" />
        </div>
        <Skeleton className="h-10 w-10 rounded-full" />
      </div>
      <Skeleton className="h-16 w-full rounded-2xl" />
      <Card className="border-border/60">
        <CardContent className="space-y-4 pt-6">
          <div className="grid grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-1">
                <Skeleton className="h-3.5 w-14" />
                <Skeleton className="h-8 w-10" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function SlackCard() {
  if (!SLACK_INVITE_URL) return null
  return (
    <a href={SLACK_INVITE_URL} target="_blank" rel="noopener noreferrer" className="block no-underline group">
      <Card className="transition-colors border-border/60 group-hover:border-foreground/30">
        <CardContent className="flex items-center gap-4 py-4">
          <div className="flex-shrink-0 rounded-lg bg-[#4A154B] p-2.5">
            <svg width="20" height="20" viewBox="0 0 123 123" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M25.8 77.6c0 7.1-5.8 12.9-12.9 12.9S0 84.7 0 77.6s5.8-12.9 12.9-12.9h12.9v12.9zm6.5 0c0-7.1 5.8-12.9 12.9-12.9s12.9 5.8 12.9 12.9v32.3c0 7.1-5.8 12.9-12.9 12.9s-12.9-5.8-12.9-12.9V77.6z" fill="#E01E5A"/>
              <path d="M45.2 25.8c-7.1 0-12.9-5.8-12.9-12.9S38.1 0 45.2 0s12.9 5.8 12.9 12.9v12.9H45.2zm0 6.5c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9H12.9C5.8 58.1 0 52.3 0 45.2s5.8-12.9 12.9-12.9h32.3z" fill="#36C5F0"/>
              <path d="M97.2 45.2c0-7.1 5.8-12.9 12.9-12.9s12.9 5.8 12.9 12.9-5.8 12.9-12.9 12.9H97.2V45.2zm-6.5 0c0 7.1-5.8 12.9-12.9 12.9s-12.9-5.8-12.9-12.9V12.9C64.9 5.8 70.7 0 77.8 0s12.9 5.8 12.9 12.9v32.3z" fill="#2EB67D"/>
              <path d="M77.8 97.2c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9-12.9-5.8-12.9-12.9V97.2h12.9zm0-6.5c-7.1 0-12.9-5.8-12.9-12.9s5.8-12.9 12.9-12.9h32.3c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9H77.8z" fill="#ECB22E"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm">Join our Slack</p>
            <p className="text-xs text-muted-foreground">Chat with other participants, ask questions, and get help</p>
          </div>
          <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0" />
        </CardContent>
      </Card>
    </a>
  )
}

export function DashboardShell() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardContent />
    </Suspense>
  )
}

function DashboardContent() {
  const { user, team, isAuthenticated, isLoading } = useAuth()
  const router = useRouter()
  const [dataError, setDataError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/")
    }
  }, [isLoading, isAuthenticated, router])

  if (isLoading) {
    return <DashboardSkeleton />
  }

  if (!isAuthenticated || !user) return null

  if (!team) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Welcome, {user.name || user.email.split("@")[0]}!</h1>
          <p className="text-muted-foreground mt-2">Create a new team or join an existing one to get started.</p>
        </div>
        <SlackCard />
        <div className="grid md:grid-cols-2 gap-6">
          <CreateTeamForm />
          <JoinTeamForm />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Welcome, {user.name || user.email.split("@")[0]}!</h1>
          <p className="text-muted-foreground mt-2">{appName}</p>
        </div>
        <ShareModal teamName={team.name} members={team.members} rank={null} />
      </div>

      <JoinedBanner
        teamName={team.name}
        memberNames={team.members.map((m) => m.name.split(" ")[0])}
      />

      <SlackCard />

      {dataError && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0" />
            <p className="text-sm text-destructive flex-1">{dataError}</p>
            <Button variant="outline" size="sm" onClick={() => setRetryCount(c => c + 1)} className="flex-shrink-0">
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      <CertificateCard />

      <DashboardTaskCards teamId={team.id} onError={setDataError} retryCount={retryCount} />

      <TeamCard team={team} currentUserId={user.id} />

      <TeamMembers
        members={team.members}
        pendingInvites={team.pending_invites ?? []}
        teamId={team.id}
        currentUserId={user.id}
      />
    </div>
  )
}
