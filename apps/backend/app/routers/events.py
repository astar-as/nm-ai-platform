from fastapi import APIRouter

from app.dependencies import DB

router = APIRouter()


@router.get("/events")
async def get_events(db: DB):
    """Return operator-managed events for the active competition."""
    rows = await db.fetch(
        """
        SELECT e.id, e.name, e.starts_at, e.ends_at, e.event_type,
               e.registration_url, e.cover_url, e.is_free, e.capacity,
               l.name AS location_name, l.city, l.latitude, l.longitude
        FROM location_events e
        JOIN locations l ON l.id = e.location_id
        JOIN competitions c ON c.id = l.competition_id
        WHERE c.is_active = true
        ORDER BY e.starts_at
        """
    )
    return [
        {
            "id": str(row["id"]),
            "name": row["name"],
            "start_at": row["starts_at"],
            "end_at": row["ends_at"],
            "location_name": row["location_name"],
            "city": row["city"],
            "latitude": row["latitude"],
            "longitude": row["longitude"],
            "cover_url": row["cover_url"],
            "url": row["registration_url"],
            "is_free": row["is_free"],
            "spots_remaining": None,
            "event_type": row["event_type"],
        }
        for row in rows
    ]
