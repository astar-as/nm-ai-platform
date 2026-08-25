"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { OverallLeaderboard } from "./overall-leaderboard"
import { TaskLeaderboard } from "./task-leaderboard"
import { useAuth } from "@/app/_providers/auth-provider"
import { Crosshair, Lock, Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { API_BASE } from "@/lib/api"
import { competitionSlug } from "@/lib/branding"
import Link from "next/link"

interface Task {
  id: string
  slug: string
  name?: string
  is_active?: boolean
}

function taskLabel(task: Task): string {
  if (task.name) return task.name
  return task.slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

function flashRow(row: Element) {
  row.scrollIntoView({ behavior: "smooth", block: "center" })
  row.classList.add("animate-row-flash")
  row.addEventListener("animationend", () => {
    row.classList.remove("animate-row-flash")
  }, { once: true })
}

function waitForRow(selector: string, timeoutMs = 5000): Promise<Element | null> {
  return new Promise((resolve) => {
    const existing = document.querySelector(selector)
    if (existing) { resolve(existing); return }

    window.dispatchEvent(new CustomEvent("expand-leaderboard"))

    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector)
      if (el) { observer.disconnect(); resolve(el) }
    })
    observer.observe(document.body, { childList: true, subtree: true })

    setTimeout(() => { observer.disconnect(); resolve(null) }, timeoutMs)
  })
}

export function LeaderboardRevealed() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { team } = useAuth()
  const [phase, setPhase] = useState<string | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [search, setSearch] = useState("")
  const scrolledRef = useRef(false)

  const paramTab = searchParams.get("tab")
  const [tab, setTab] = useState(paramTab || "overall")

  const updateParams = useCallback((newTab: string, teamSlug?: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (newTab !== "overall") {
      params.set("tab", newTab)
    } else {
      params.delete("tab")
    }
    if (teamSlug) {
      params.set("team", teamSlug)
    } else {
      params.delete("team")
    }
    const qs = params.toString()
    router.replace(`/leaderboard${qs ? `?${qs}` : ""}`, { scroll: false })
  }, [searchParams, router])

  const handleTabChange = useCallback((newTab: string) => {
    setTab(newTab)
    updateParams(newTab)
  }, [updateParams])

  const handleFindMyTeam = useCallback(async () => {
    if (!team?.id || !team?.slug) return
    updateParams(tab, team.slug)
    const row = await waitForRow(`tr[data-team-id="${team.id}"]`)
    if (row) flashRow(row)
  }, [team, tab, updateParams])

  useEffect(() => {
    if (scrolledRef.current) return
    const teamParam = searchParams.get("team")
    if (!teamParam) return

    scrolledRef.current = true
    waitForRow(`tr[data-team-slug="${teamParam}"]`).then((row) => {
      if (row) flashRow(row)
    })
  }, [searchParams, tab])

  useEffect(() => {
    let mounted = true
    fetch(`${API_BASE}/competitions/${competitionSlug}/tasks`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (mounted && Array.isArray(data)) setTasks(data)
      })
      .catch(() => {})
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    async function checkStatus() {
      try {
        const res = await fetch(`${API_BASE}/finals/status`)
        if (res.ok) {
          const data = await res.json()
          setPhase(data.phase)
        } else {
          setPhase("open")
        }
      } catch {
        setPhase("open")
      }
    }
    checkStatus()
    const id = setInterval(checkStatus, 30_000)
    return () => clearInterval(id)
  }, [])

  const isRevealed = phase === "revealed"
  const showLeaderboard = phase === "open" || phase === "revealed"

  if (phase === null) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 animate-spin rounded-full border-4 border-muted-foreground/20 border-t-muted-foreground" />
      </div>
    )
  }

  if (!showLeaderboard) {
    return (
      <>
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight">Leaderboard</h1>
        </div>
        <Card className="p-12 text-center max-w-lg mx-auto">
          <Lock className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Closed for review</h2>
          <p className="text-muted-foreground mb-4">
            Rankings are hidden while the jury reviews submissions.
          </p>
          <p className="text-sm text-muted-foreground">
            Head to the{" "}
            <Link href="/finals" className="text-primary hover:underline">finals page</Link>{" "}
            to submit your repository links.
          </p>
        </Card>
      </>
    )
  }

  return (
    <>
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Leaderboard</h1>
      </div>

      <div className="flex items-center gap-4 mb-2 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search teams..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 w-60"
          />
        </div>
        {team && (
          <Button variant="outline" size="sm" onClick={handleFindMyTeam} className="ml-auto">
            <Crosshair className="w-4 h-4" />
            Find My Team
          </Button>
        )}
      </div>

      <Tabs value={tab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="flex w-full mb-0">
          <TabsTrigger value="overall" className="flex-1">Overall</TabsTrigger>
          {tasks.map((task) => (
            <TabsTrigger key={task.slug} value={task.slug} className="flex-1">{taskLabel(task)}</TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="overall">
          <OverallLeaderboard isRevealed={isRevealed} search={search} />
        </TabsContent>
        {tasks.map((task) => (
          <TabsContent key={task.slug} value={task.slug}>
            <TaskLeaderboard taskSlug={task.slug} search={search} />
          </TabsContent>
        ))}
      </Tabs>
    </>
  )
}
