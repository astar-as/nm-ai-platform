export const dynamic = "force-dynamic"

import { TaskCard } from "./_components/task-card"
import { API_BASE } from "@/lib/api"
import { competitionSlug } from "@/lib/branding"

interface Task {
  id: string
  slug: string
  name?: string
  description?: string
  metric?: string
  type: string
  is_active: boolean
  opens_at: string | null
  closes_at: string | null
  max_response_time_ms: number | null
}

function taskLabel(task: Task): string {
  if (task.name) return task.name
  return task.slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

async function getTasks(): Promise<Task[]> {
  try {
    const res = await fetch(`${API_BASE}/competitions/${competitionSlug}/tasks`, {
      cache: "no-store",
    })
    if (!res.ok) throw new Error("Failed to fetch")
    const contentType = res.headers.get("content-type") || ""
    if (!contentType.includes("application/json")) throw new Error("Not JSON")
    const data = await res.json()
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

export default async function TasksPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Tasks</h1>
        <p className="text-muted-foreground mt-2">
          Submit to compete
        </p>
      </div>

      <TaskCards />
    </div>
  )
}

async function TaskCards() {
  const tasks = await getTasks()

  if (tasks.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No tasks are available yet. Check back soon.
      </p>
    )
  }

  return (
    <div className="grid gap-4">
      {tasks.map((task) => (
        <TaskCard
          key={task.id}
          slug={task.slug}
          label={taskLabel(task)}
          description={task.description || "Compete in this task and climb the leaderboard."}
          metric={task.metric || "Score"}
          opensAt={task.opens_at}
          closesAt={task.closes_at}
          maxResponseTimeMs={task.max_response_time_ms}
        />
      ))}
    </div>
  )
}
