"use client"

import { useState, useEffect, useCallback } from "react"
import dynamic from "next/dynamic"
import { MapPin, Loader2, ExternalLink, Ticket, CalendarPlus, Clock } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { EventFilter } from "./event-filter"
import { API_BASE } from "@/lib/api"

const EventsMap = dynamic(
  () => import("./events-map").then((m) => m.EventsMap),
  { ssr: false, loading: () => <div className="h-full min-h-[300px] rounded-xl border border-border bg-muted flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div> }
)

interface CompetitionEvent {
  id: string
  name: string
  start_at: string
  end_at: string
  location_name: string
  city: string
  latitude: number | null
  longitude: number | null
  cover_url: string | null
  url: string | null
  is_free: boolean
  spots_remaining: number | null
  event_type: string
}

const EVENT_TYPE_COLORS: Record<string, string> = {
  kickoff: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  workshop: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  stream: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  ceremony: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  social: "bg-pink-500/20 text-pink-400 border-pink-500/30",
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
}

function formatDateHeader(iso: string) {
  const d = new Date(iso)
  const day = d.toLocaleDateString("en-GB", { day: "numeric" })
  const month = d.toLocaleDateString("en-GB", { month: "long" })
  const weekday = d.toLocaleDateString("en-GB", { weekday: "long" })
  return `${day}. ${month} · ${weekday}`
}

function formatDateRange(start: string, end: string) {
  const s = new Date(start)
  const e = new Date(end)
  if (s.toDateString() === e.toDateString()) {
    return `${formatTime(start)} – ${formatTime(end)}`
  }
  const startDate = s.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
  const endDate = e.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
  return `${startDate} ${formatTime(start)} – ${endDate} ${formatTime(end)}`
}

function groupByDate(events: CompetitionEvent[]): Map<string, CompetitionEvent[]> {
  const groups = new Map<string, CompetitionEvent[]>()
  for (const event of events) {
    const dateKey = new Date(event.start_at).toDateString()
    const existing = groups.get(dateKey) || []
    existing.push(event)
    groups.set(dateKey, existing)
  }
  return groups
}

function toGoogleCalendarDate(iso: string) {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")
}

function googleCalendarUrl(event: CompetitionEvent) {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.name,
    dates: `${toGoogleCalendarDate(event.start_at)}/${toGoogleCalendarDate(event.end_at)}`,
    location: `${event.location_name}${event.city ? `, ${event.city}` : ""}`,
    details: event.url ? `More information: ${event.url}` : "",
  })
  return `https://calendar.google.com/calendar/event?${params.toString()}`
}

function EventSection({ grouped, isPast }: { grouped: Map<string, CompetitionEvent[]>; isPast: boolean }) {
  return (
    <>
      {[...grouped.entries()].map(([dateKey, dateEvents]) => (
        <div key={dateKey} className={isPast ? "opacity-60" : ""}>
          <div className="flex items-center gap-3 mb-4">
            <div className={`w-2 h-2 rounded-full shrink-0 ${isPast ? "bg-muted-foreground" : "bg-primary"}`} />
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              {formatDateHeader(dateEvents[0].start_at)}
            </h2>
          </div>

          <div className="space-y-3 ml-4 border-l border-border/50 pl-5">
            {dateEvents.map((event) => (
              <div
                key={event.id}
                id={`event-${event.id}`}
                className={`glass rounded-xl p-5 block transition-all group ${isPast ? "hover:opacity-80" : "hover:shadow-lg hover:-translate-y-0.5"}`}
              >
                <div>
                  <div className="flex gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm text-muted-foreground">
                          {formatDateRange(event.start_at, event.end_at)}
                        </p>
                        {isPast && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            Past
                          </Badge>
                        )}
                      </div>
                      <h3 className="font-semibold text-base mt-1 group-hover:text-primary transition-colors">
                        {event.name}
                      </h3>
                      <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1.5">
                        <MapPin className="w-3.5 h-3.5 shrink-0" />
                        {event.location_name}{event.city ? `, ${event.city}` : ""}
                      </p>
                      <div className="flex items-center gap-2 mt-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${EVENT_TYPE_COLORS[event.event_type] ?? "bg-muted text-muted-foreground border-border"}`}>
                          {event.event_type.charAt(0).toUpperCase() + event.event_type.slice(1)}
                        </span>
                        {!isPast && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Ticket className="w-3 h-3" />
                            {event.is_free ? "Free" : "Registration required"}
                            {event.spots_remaining !== null && ` · ${event.spots_remaining} spots`}
                          </span>
                        )}
                      </div>
                    </div>
                    {event.cover_url && (
                      // Event images come from the operator-configured event
                      // provider, so they cannot use a static Next image host.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={event.cover_url}
                        alt=""
                        className={`w-20 h-20 rounded-lg object-cover shrink-0 hidden sm:block ${isPast ? "grayscale" : ""}`}
                      />
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4 mt-3">
                  {!isPast && event.url && (
                    <a
                      href={event.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-primary no-underline"
                    >
                      Register <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  {isPast && event.url && (
                    <a
                      href={event.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-muted-foreground no-underline"
                    >
                      View event <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  {!isPast && (
                    <a
                      href={googleCalendarUrl(event)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors no-underline"
                    >
                      <CalendarPlus className="w-3 h-3" />
                      Add to Calendar
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  )
}

export function EventsList() {
  const [events, setEvents] = useState<CompetitionEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [filterType, setFilterType] = useState<string | null>(null)

  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/events`)
      if (!res.ok) throw new Error("Failed to fetch")
      const data = await res.json()
      setEvents(Array.isArray(data) ? data : [])
    } catch {
      setEvents([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

  const filtered = filterType
    ? events.filter((e) => e.event_type === filterType)
    : events

  const now = new Date()
  const upcoming = filtered
    .filter((e) => new Date(e.end_at) >= now)
    .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())
  const past = filtered
    .filter((e) => new Date(e.end_at) < now)
    .sort((a, b) => new Date(b.start_at).getTime() - new Date(a.start_at).getTime())

  const upcomingGrouped = groupByDate(upcoming)
  const pastGrouped = groupByDate(past)

  const mapLocations = [...filtered
    .filter((e) => e.latitude !== null && e.longitude !== null)
    .reduce((acc, e) => {
      const key = `${e.latitude},${e.longitude}`
      const existing = acc.get(key)
      const evt = { id: e.id, name: e.name, dateLabel: formatDateRange(e.start_at, e.end_at), latitude: e.latitude!, longitude: e.longitude! }
      if (existing) {
        existing.events.push(evt)
      } else {
        acc.set(key, { id: e.id, name: e.location_name, city: e.city, latitude: e.latitude!, longitude: e.longitude!, events: [evt] })
      }
      return acc
    }, new Map<string, { id: string; name: string; city: string; latitude: number; longitude: number; events: { id: string; name: string; dateLabel: string; latitude: number; longitude: number }[] }>())
    .values()]

  const handleEventSelect = useCallback((eventId: string) => {
    const el = document.getElementById(`event-${eventId}`)
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" })
      el.classList.add("ring-2", "ring-primary", "ring-offset-2", "ring-offset-background")
      setTimeout(() => el.classList.remove("ring-2", "ring-primary", "ring-offset-2", "ring-offset-background"), 2000)
    }
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <EventFilter selected={filterType} onChange={setFilterType} />

      <div className="lg:hidden">
        <EventsMap locations={mapLocations} onEventSelect={handleEventSelect} />
      </div>

      <div className="flex gap-8">
        <div className="flex-1 min-w-0 space-y-8">
          <EventSection grouped={upcomingGrouped} isPast={false} />

          {past.length > 0 && (
            <>
              <div className="flex items-center gap-3 pt-4">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" /> Past Events
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <EventSection grouped={pastGrouped} isPast={true} />
            </>
          )}

          {filtered.length === 0 && (
            <p className="text-center text-muted-foreground py-12">No events found.</p>
          )}
        </div>

        <div className="hidden lg:block w-80 shrink-0">
          <div className="sticky top-24">
            <EventsMap locations={mapLocations} onEventSelect={handleEventSelect} />
          </div>
        </div>
      </div>
    </div>
  )
}
