import { EventsList } from "./_components/events-list"
import { appName } from "@/lib/branding"

export default function EventsPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Events</h1>
        <p className="text-muted-foreground mt-2">
          {appName}
        </p>
      </div>

      <EventsList />
    </div>
  )
}
