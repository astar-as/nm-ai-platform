"use client"

import { useEffect } from "react"
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"

interface MapEvent {
  id: string
  name: string
  dateLabel: string
  latitude: number
  longitude: number
}

interface MapLocation {
  id: string
  name: string
  city: string
  latitude: number
  longitude: number
  events: MapEvent[]
}

interface EventsMapProps {
  locations: MapLocation[]
  onEventSelect?: (eventId: string) => void
}

const markerIcon = new L.Icon({
  iconUrl: "data:image/svg+xml;base64," + btoa(`
    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="40" viewBox="0 0 28 40">
      <path d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 26 14 26s14-15.5 14-26C28 6.268 21.732 0 14 0z" fill="#0853CD"/>
      <circle cx="14" cy="14" r="6" fill="white"/>
    </svg>
  `),
  iconSize: [28, 40],
  iconAnchor: [14, 40],
  popupAnchor: [0, -40],
})

function FitBounds({ locations }: { locations: MapLocation[] }) {
  const map = useMap()
  useEffect(() => {
    setTimeout(() => map.invalidateSize(), 100)
    if (locations.length === 0) return
    if (locations.length === 1) {
      map.setView([locations[0].latitude, locations[0].longitude], 12)
      return
    }
    const bounds = L.latLngBounds(locations.map((l) => [l.latitude, l.longitude]))
    map.fitBounds(bounds, { padding: [30, 30] })
  }, [locations, map])
  return null
}

export function EventsMap({ locations, onEventSelect }: EventsMapProps) {
  return (
    <div className="rounded-xl overflow-hidden border border-border shadow-md" style={{ height: 400 }}>
      <MapContainer
        center={[30, 0]}
        zoom={2}
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds locations={locations} />
        {locations.map((location) => (
          <Marker
            key={`${location.latitude},${location.longitude}`}
            position={[location.latitude, location.longitude]}
            icon={markerIcon}
          >
            <Popup>
              <div className="space-y-2 min-w-[160px]">
                {location.events.map((evt) => (
                  <div key={evt.id} className="border-b border-border last:border-0 pb-2 last:pb-0">
                    <p className="font-bold text-sm leading-tight">{evt.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{evt.dateLabel}</p>
                    {onEventSelect && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          onEventSelect(evt.id)
                        }}
                        className="mt-1 text-xs font-medium text-blue-600 hover:text-blue-800 cursor-pointer"
                      >
                        View
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  )
}
