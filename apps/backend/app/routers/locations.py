from fastapi import APIRouter, HTTPException, Query, status

from app.dependencies import DB, OptionalUser

router = APIRouter()


@router.get("/competitions/{slug}/locations")
async def get_locations(
    slug: str,
    db: DB,
    user: OptionalUser,
    event_type: str | None = Query(None),
):
    comp = await db.fetchrow("SELECT id FROM competitions WHERE slug = $1", slug)
    if not comp:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    rows = await db.fetch(
        "SELECT * FROM locations WHERE competition_id = $1 ORDER BY city",
        comp["id"],
    )

    is_participant = False
    if user is not None:
        team = await db.fetchrow(
            "SELECT 1 FROM teams t JOIN team_members tm ON tm.team_id = t.id "
            "WHERE t.competition_id = $1 AND tm.user_id = $2",
            comp["id"], user["id"],
        )
        is_participant = team is not None

    event_query = """
        SELECT * FROM location_events
        WHERE location_id = $1
    """
    params: list = []
    if event_type:
        event_query += " AND event_type = $2"
        params.append(event_type)
    event_query += " ORDER BY starts_at"

    locations = []
    for loc in rows:
        if event_type:
            events = await db.fetch(event_query, loc["id"], *params)
        else:
            events = await db.fetch(event_query, loc["id"])

        event_list = [
            {
                "id": str(e["id"]),
                "name": e["name"],
                "description": e["description"],
                **({"detailed_description": e["detailed_description"]} if is_participant else {}),
                "starts_at": e["starts_at"].isoformat() if e["starts_at"] else None,
                "ends_at": e["ends_at"].isoformat() if e["ends_at"] else None,
                "event_type": e["event_type"],
                "is_featured": e["is_featured"],
            }
            for e in events
        ]

        # If filtering by event_type and no events match, skip this location
        if event_type and not event_list:
            continue

        location_data = {
            "id": str(loc["id"]),
            "name": loc["name"],
            "city": loc["city"],
            "address": loc["address"],
            "description": loc["description"],
            "google_maps_url": loc["google_maps_url"],
            "latitude": loc["latitude"],
            "longitude": loc["longitude"],
            "opening_hours": loc["opening_hours"],
            "image_url": loc["image_url"],
            "events": event_list,
        }

        if is_participant:
            location_data.update({
                "detailed_description": loc["detailed_description"],
            })

        locations.append(location_data)

    return locations
