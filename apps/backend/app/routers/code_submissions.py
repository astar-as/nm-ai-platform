import hashlib
import logging
import os
import shutil
import tempfile
import uuid as uuid_mod
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, File, HTTPException, Query, UploadFile, status
from pydantic import BaseModel, Field

try:
    from google.cloud import storage
except ImportError:
    storage = None

from app.dependencies import DB, AdminUser, CurrentUser
from app.helpers import (
    check_competition_open,
    get_team_for_competition,
)
from app.helpers import (
    get_submission_quota as calculate_submission_quota,
)

logger = logging.getLogger(__name__)

router = APIRouter()
admin_router = APIRouter()


GCS_BUCKET = os.getenv("CODE_SUBMISSIONS_BUCKET", "code-submissions")
PARTICIPANT_DATA_BUCKET = os.getenv("PARTICIPANT_DATA_BUCKET", "participant-data")

_SANITIZED_ERRORS = {
    "security scan failed": "Your submission contains disallowed code. See the starter kit for allowed libraries.",
    "submission validation failed": "Your zip failed validation. Ensure it contains run.py at the root with no disallowed files.",
}


def _sanitize_error(error: str | None) -> str | None:
    if not error:
        return None
    lower = error.lower()
    for keyword, msg in _SANITIZED_ERRORS.items():
        if keyword in lower:
            return msg
    if any(kw in lower for kw in ("traceback", "/app/", "/home/", "/tmp/", "file \"", "gs://")):
        return "Internal error during evaluation"
    return error[:500]
LOCAL_STORAGE_DIR = os.getenv("LOCAL_STORAGE_DIR")
MAX_UPLOAD_BYTES = 420 * 1024 * 1024

_gcs_client = None

def _get_gcs_client():
    global _gcs_client
    if _gcs_client is None and storage:
        _gcs_client = storage.Client()
    return _gcs_client


def _artifact_key(task_id, team_id, submission_id, filename: str) -> str:
    return f"tasks/{task_id}/teams/{team_id}/submissions/{submission_id}/{filename}"


def _max_upload_bytes(scoring_config: dict) -> int:
    try:
        configured_mb = int(scoring_config.get("max_upload_mb", 100))
    except (TypeError, ValueError):
        configured_mb = 100
    return max(1, min(configured_mb, MAX_UPLOAD_BYTES // (1024 * 1024))) * 1024 * 1024


@router.post("/{task_id}/submissions/upload", status_code=status.HTTP_201_CREATED)
async def upload_code_submission(
    task_id: str,
    db: DB,
    user: CurrentUser,
    file: UploadFile = File(...),
):
    task = await db.fetchrow(
        """SELECT t.id, t.competition_id, t.is_active, t.scoring_config FROM tasks t
           JOIN competitions c ON c.id = t.competition_id
           WHERE t.id = $1 AND t.submission_mode = 'code' AND c.is_active = true
             AND COALESCE(t.reveals_at, c.starts_at) <= NOW()""",
        task_id,
    )
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    if not task["is_active"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Task not active")

    await check_competition_open(db, task["competition_id"], task_id=task_id)

    if not file.filename or not file.filename.endswith(".zip"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only .zip files are accepted")

    team = await get_team_for_competition(db, task["competition_id"], user["id"])
    if not team:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Not in a team")

    team_id = team["id"]
    scoring_config = task["scoring_config"] or {}
    limits = scoring_config.get("submission_limits", {})

    max_upload_bytes = _max_upload_bytes(scoring_config)
    upload = tempfile.SpooledTemporaryFile(max_size=8 * 1024 * 1024)
    digest = hashlib.sha256()
    size = 0
    try:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            if size > max_upload_bytes:
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail=f"File too large. Max {max_upload_bytes // (1024 * 1024)}MB",
                )
            digest.update(chunk)
            upload.write(chunk)
        upload.seek(0)
        if upload.read(4) != b"PK\x03\x04":
            raise HTTPException(status_code=400, detail="Invalid ZIP archive")
        upload.seek(0)

        file_hash = digest.hexdigest()[:16]

        async with db.transaction():
            await db.execute(
                "SELECT pg_advisory_xact_lock(hashtext($1 || ':' || $2))",
                str(team_id), str(task_id),
            )

            quota = await calculate_submission_quota(db, team_id, task_id, limits)
            if quota["is_banned"]:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Submissions disabled: {quota['ban_reason'] or 'Banned'}")
            if quota["in_flight"] >= quota["max_in_flight"]:
                raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=f"Max {quota['max_in_flight']} in-flight submissions")
            if quota["daily_used"] >= quota["daily_limit"]:
                raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=f"Daily limit reached ({quota['max_per_day']}/day). Resets at {quota['resets_at']}.")

            submission_id = await db.fetchval(
                """
                INSERT INTO submissions (team_id, task_id, submission_type, upload_size_bytes, created_by, status)
                VALUES ($1, $2, 'code', $3, $4, 'uploading') RETURNING id
                """,
                team_id, task_id, size, user["id"],
            )

        artifact_key = _artifact_key(task_id, team_id, submission_id, f"{file_hash}.zip")

        try:
            if LOCAL_STORAGE_DIR:
                local_path = Path(LOCAL_STORAGE_DIR).resolve() / artifact_key
                local_path.parent.mkdir(parents=True, exist_ok=True)
                with local_path.open("wb") as destination:
                    shutil.copyfileobj(upload, destination)
                stored_path = str(local_path)
            else:
                stored_path = f"gs://{GCS_BUCKET}/{artifact_key}"
                client = _get_gcs_client()
                if client is None:
                    raise RuntimeError("Object storage client is unavailable")
                bucket = client.bucket(GCS_BUCKET)
                blob = bucket.blob(artifact_key)
                blob.upload_from_file(upload, content_type="application/zip")
        except Exception as exc:
            logger.error("Artifact upload failed", exc_info=exc)
            await db.execute(
                "UPDATE submissions SET status = 'failed', last_error = 'Upload to storage failed', error_type = 'infrastructure' WHERE id = $1",
                submission_id,
            )
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Upload failed") from exc

        await db.execute(
            "UPDATE submissions SET artifact_path = $1, status = 'queued', queued_at = NOW() WHERE id = $2",
            stored_path, submission_id,
        )

        return {"id": str(submission_id), "status": "queued", "size_bytes": size}
    finally:
        upload.close()


@router.post("/{task_id}/submissions/init-upload", status_code=status.HTTP_201_CREATED)
async def init_upload(task_id: str, db: DB, user: CurrentUser):
    task = await db.fetchrow(
        """SELECT t.id, t.competition_id, t.is_active, t.scoring_config FROM tasks t
           JOIN competitions c ON c.id = t.competition_id
           WHERE t.id = $1 AND t.submission_mode = 'code' AND c.is_active = true
             AND COALESCE(t.reveals_at, c.starts_at) <= NOW()""",
        task_id,
    )
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    if not task["is_active"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Task not active")
    await check_competition_open(db, task["competition_id"], task_id=task_id)

    team = await get_team_for_competition(db, task["competition_id"], user["id"])
    if not team:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Not in a team")

    team_id = team["id"]
    scoring_config = task["scoring_config"] or {}
    limits = scoring_config.get("submission_limits", {})
    max_upload_bytes = _max_upload_bytes(scoring_config)

    if LOCAL_STORAGE_DIR:
        return {"id": None, "upload_url": None, "method": "direct", "max_upload_bytes": max_upload_bytes}
    if not storage:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Storage not available")

    async with db.transaction():
        await db.execute(
            "SELECT pg_advisory_xact_lock(hashtext($1 || ':' || $2))",
            str(team_id), str(task_id),
        )

        await db.execute(
            """
            DELETE FROM submissions
            WHERE team_id = $1 AND task_id = $2 AND status = 'uploading'
              AND queued_at < NOW() - INTERVAL '20 minutes'
            """,
            team_id, task_id,
        )

        quota = await calculate_submission_quota(db, team_id, task_id, limits)
        if quota["is_banned"]:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Submissions disabled: {quota['ban_reason'] or 'Banned'}")
        if quota["in_flight"] >= quota["max_in_flight"]:
            raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=f"Max {quota['max_in_flight']} in-flight submissions")
        if quota["daily_used"] >= quota["daily_limit"]:
            raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=f"Daily limit reached ({quota['max_per_day']}/day). Resets at {quota['resets_at']}.")

        submission_id = await db.fetchval(
            """
            INSERT INTO submissions (team_id, task_id, submission_type, created_by, status)
            VALUES ($1, $2, 'code', $3, 'uploading') RETURNING id
            """,
            team_id, task_id, user["id"],
        )

    artifact_key = _artifact_key(task_id, team_id, submission_id, "upload.zip")

    try:
        from google.auth import default as auth_default
        from google.auth.transport import requests as auth_requests

        credentials, _ = auth_default()
        credentials.refresh(auth_requests.Request())

        client = _get_gcs_client()
        bucket = client.bucket(GCS_BUCKET)
        blob = bucket.blob(artifact_key)

        upload_url = blob.generate_signed_url(
            version="v4",
            expiration=timedelta(minutes=15),
            method="PUT",
            content_type="application/zip",
            headers={"x-goog-content-length-range": f"1,{max_upload_bytes}"},
            service_account_email=credentials.service_account_email,
            access_token=credentials.token,
        )
    except Exception as e:
        logger.error("Failed to generate upload URL", exc_info=e)
        await db.execute(
            "UPDATE submissions SET status = 'failed', last_error = 'Failed to generate upload URL', error_type = 'infrastructure' WHERE id = $1",
            submission_id,
        )
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to generate upload URL")

    return {
        "id": str(submission_id),
        "upload_url": upload_url,
        "method": "signed_url",
        "max_upload_bytes": max_upload_bytes,
    }


@router.post("/{task_id}/submissions/{submission_id}/finalize", status_code=status.HTTP_200_OK)
async def finalize_upload(task_id: str, submission_id: str, db: DB, user: CurrentUser):
    async with db.transaction():
        sub = await db.fetchrow(
            """
            SELECT s.id, s.team_id, s.status
            FROM submissions s
            JOIN team_members tm ON tm.team_id = s.team_id AND tm.user_id = $1
            WHERE s.id = $2 AND s.task_id = $3
            FOR UPDATE
            """,
            user["id"], submission_id, task_id,
        )
        if not sub:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")
        if sub["status"] != "uploading":
            if sub["status"] in ("queued", "processing", "completed"):
                return {"id": str(submission_id), "status": sub["status"]}
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Submission is not in uploading state")

        task = await db.fetchrow(
            """SELECT t.scoring_config, t.is_active, t.competition_id, t.submission_mode
               FROM tasks t JOIN competitions c ON c.id = t.competition_id
               WHERE t.id = $1 AND c.is_active = true
                 AND COALESCE(t.reveals_at, c.starts_at) <= NOW()""",
            task_id,
        )
        if not task or not task["is_active"]:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Task not active")
        if task["submission_mode"] != "code":
            raise HTTPException(status_code=400, detail="Task does not accept code uploads")
        await check_competition_open(db, task["competition_id"], task_id=task_id)
        scoring_config = (task["scoring_config"] if task else None) or {}
        max_bytes = _max_upload_bytes(scoring_config)

        ban = await db.fetchrow(
            "SELECT reason FROM team_bans WHERE team_id = $1 AND task_id = $2",
            sub["team_id"], task_id,
        )
        if ban:
            await db.execute(
                "UPDATE submissions SET status = 'failed', last_error = 'Submissions disabled', error_type = 'cancelled' WHERE id = $1",
                submission_id,
            )
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Submissions disabled: {ban['reason'] or 'Banned'}")

        artifact_key = _artifact_key(task_id, sub["team_id"], sub["id"], "upload.zip")
        stored_path = f"gs://{GCS_BUCKET}/{artifact_key}"

        if not LOCAL_STORAGE_DIR and storage:
            client = _get_gcs_client()
            bucket = client.bucket(GCS_BUCKET)
            blob = bucket.blob(artifact_key)
            if not blob.exists():
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File not found in storage. Upload may have failed.")
            blob.reload()
            if blob.size and blob.size > max_bytes:
                blob.delete()
                await db.execute(
                    "UPDATE submissions SET status = 'failed', last_error = 'File too large' WHERE id = $1",
                    submission_id,
                )
                raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="File too large")

            header = blob.download_as_bytes(start=0, end=3)
            if len(header) < 4 or header[:4] != b'PK\x03\x04':
                blob.delete()
                await db.execute(
                    "UPDATE submissions SET status = 'failed', last_error = 'Invalid file type: not a ZIP archive' WHERE id = $1",
                    submission_id,
                )
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid file type: not a ZIP archive")

            await db.execute(
                "UPDATE submissions SET artifact_path = $1, upload_size_bytes = $2, status = 'queued', queued_at = NOW() WHERE id = $3",
                stored_path, blob.size, submission_id,
            )
        elif LOCAL_STORAGE_DIR:
            local_path = Path(LOCAL_STORAGE_DIR).resolve() / artifact_key
            if not local_path.exists():
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File not found in local storage")
            local_size = local_path.stat().st_size
            if local_size > max_bytes:
                local_path.unlink(missing_ok=True)
                await db.execute(
                    "UPDATE submissions SET status = 'failed', last_error = 'File too large', error_type = 'validation' WHERE id = $1",
                    submission_id,
                )
                raise HTTPException(status_code=413, detail="File too large")
            with local_path.open("rb") as uploaded_file:
                if uploaded_file.read(4) != b"PK\x03\x04":
                    local_path.unlink(missing_ok=True)
                    await db.execute(
                        "UPDATE submissions SET status = 'failed', last_error = 'Invalid file type', error_type = 'validation' WHERE id = $1",
                        submission_id,
                    )
                    raise HTTPException(status_code=400, detail="Invalid ZIP archive")
            await db.execute(
                "UPDATE submissions SET artifact_path = $1, upload_size_bytes = $2, status = 'queued', queued_at = NOW() WHERE id = $3",
                str(local_path), local_size, submission_id,
            )
        else:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Storage not available")

    return {"id": str(submission_id), "status": "queued"}


@router.post("/{task_id}/submissions/{submission_id}/cancel", status_code=status.HTTP_200_OK)
async def cancel_upload(task_id: str, submission_id: str, db: DB, user: CurrentUser):
    sub = await db.fetchrow(
        """
        SELECT s.id, s.team_id FROM submissions s
        JOIN team_members tm ON tm.team_id = s.team_id AND tm.user_id = $3
        WHERE s.id = $1 AND s.task_id = $2 AND s.status = 'uploading'
        """,
        submission_id, task_id, user["id"],
    )
    if not sub:
        return {"cancelled": False}

    result = await db.execute(
        "DELETE FROM submissions WHERE id = $1 AND status = 'uploading'",
        submission_id,
    )

    cancelled = "DELETE 1" in result

    if cancelled and storage and not LOCAL_STORAGE_DIR:
        try:
            artifact_key = _artifact_key(task_id, sub["team_id"], sub["id"], "upload.zip")
            client = _get_gcs_client()
            bucket = client.bucket(GCS_BUCKET)
            blob = bucket.blob(artifact_key)
            blob.delete()
        except Exception as e:
            logger.warning(f"GCS cleanup failed for {submission_id}: {e}")
    elif cancelled and LOCAL_STORAGE_DIR:
        artifact_key = _artifact_key(task_id, sub["team_id"], sub["id"], "upload.zip")
        local_path = Path(LOCAL_STORAGE_DIR).resolve() / artifact_key
        try:
            local_path.unlink(missing_ok=True)
        except OSError:
            logger.warning("Local artifact cleanup failed for %s", submission_id)

    return {"cancelled": cancelled}


@router.get("/{task_id}/submissions/quota")
async def get_code_submission_quota(task_id: str, db: DB, user: CurrentUser):
    task = await db.fetchrow(
        """SELECT t.id, t.competition_id, t.scoring_config FROM tasks t
           JOIN competitions c ON c.id = t.competition_id
           WHERE t.id = $1 AND t.submission_mode = 'code' AND t.is_active = true
             AND c.is_active = true
             AND COALESCE(t.reveals_at, c.starts_at) <= NOW()""",
        task_id,
    )
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    team = await get_team_for_competition(db, task["competition_id"], user["id"])
    if not team:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Not in a team")

    scoring_config = task["scoring_config"] or {}
    limits = scoring_config.get("submission_limits", {})
    return await calculate_submission_quota(db, team["id"], task_id, limits)


@router.get("/{task_id}/submissions/upload")
async def list_code_submissions(task_id: str, db: DB, user: CurrentUser):
    task = await db.fetchrow(
        """SELECT t.id, t.competition_id FROM tasks t
           JOIN competitions c ON c.id = t.competition_id
           WHERE t.id = $1 AND t.submission_mode = 'code' AND t.is_active = true
             AND c.is_active = true
             AND COALESCE(t.reveals_at, c.starts_at) <= NOW()""",
        task_id,
    )
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    team = await get_team_for_competition(db, task["competition_id"], user["id"])
    if not team:
        return []

    selected_id = await db.fetchval(
        "SELECT selected_submission_id FROM leaderboard_scores WHERE team_id = $1 AND task_id = $2",
        team["id"], task_id,
    )

    rows = await db.fetch(
        """
        SELECT s.id, s.status, s.submission_type, s.upload_size_bytes,
               s.queued_at, s.started_at, s.completed_at, s.last_error,
               s.error_type,
               e.score, e.metrics, e.duration_ms, e.sandbox_exit_code
        FROM submissions s
        LEFT JOIN evaluations e ON e.submission_id = s.id
        WHERE s.team_id = $1 AND s.task_id = $2
        ORDER BY s.queued_at DESC
        """,
        team["id"],
        task_id,
    )

    return [
        {
            "id": str(r["id"]),
            "status": r["status"],
            "submission_type": r["submission_type"],
            "upload_size_bytes": r["upload_size_bytes"],
            "queued_at": r["queued_at"],
            "started_at": r["started_at"],
            "completed_at": r["completed_at"],
            "score": float(r["score"]) if r["score"] is not None else None,
            "duration_ms": r["duration_ms"],
            "error_type": r["error_type"],
            "error_message": _sanitize_error(r["last_error"]),
            "is_selected_for_final": r["id"] == selected_id if selected_id else False,
        }
        for r in rows
    ]


@router.post("/{task_id}/submissions/{submission_id}/select-for-final")
async def select_submission_for_final(task_id: str, submission_id: str, db: DB, user: CurrentUser):
    task = await db.fetchrow(
        """SELECT t.id, t.competition_id FROM tasks t
           JOIN competitions c ON c.id = t.competition_id
           WHERE t.id = $1 AND t.submission_mode = 'code'
             AND t.is_active = true AND c.is_active = true
             AND COALESCE(t.reveals_at, c.starts_at) <= NOW()""",
        task_id,
    )
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    team = await get_team_for_competition(db, task["competition_id"], user["id"])
    if not team:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Must be in a team")

    sub = await db.fetchrow(
        "SELECT id FROM submissions WHERE id = $1 AND team_id = $2 AND task_id = $3 AND status = 'completed'",
        submission_id, team["id"], task_id,
    )
    if not sub:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found or not completed")

    result = await db.execute(
        "UPDATE leaderboard_scores SET selected_submission_id = $1 WHERE team_id = $2 AND task_id = $3",
        submission_id, team["id"], task_id,
    )
    if result == "UPDATE 0":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No leaderboard entry yet — submit and get scored first")

    return {"selected": True, "submission_id": str(submission_id)}


@router.get("/{task_id}/categories")
async def get_task_categories(task_id: str, db: DB):
    task_visible = await db.fetchval(
        """SELECT 1 FROM tasks t JOIN competitions c ON c.id = t.competition_id
           WHERE t.id = $1 AND t.is_active = true AND c.is_active = true
             AND COALESCE(t.reveals_at, c.starts_at) <= NOW()""",
        task_id,
    )
    if not task_visible:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    categories = await db.fetch(
        """
        SELECT slug, name, description, unlocks_at, is_active, sort_order
        FROM task_categories
        WHERE task_id = $1 AND is_active = true
          AND (unlocks_at IS NULL OR unlocks_at <= NOW())
        ORDER BY sort_order
        """,
        task_id,
    )
    return [
        {
            "slug": c["slug"],
            "name": c["name"],
            "description": c["description"],
            "unlocks_at": c["unlocks_at"],
            "is_active": c["is_active"],
            "is_unlocked": c["unlocks_at"] is None or c["unlocks_at"] <= datetime.now(timezone.utc),
        }
        for c in categories
    ]


@router.get("/{task_id}/download-data")
async def get_download_links(task_id: str, db: DB, user: CurrentUser):
    task = await db.fetchrow(
        """SELECT t.id, t.competition_id, t.scoring_config FROM tasks t
           JOIN competitions c ON c.id = t.competition_id
           WHERE t.id = $1 AND t.submission_mode = 'code' AND t.is_active = true
             AND c.is_active = true
             AND COALESCE(t.reveals_at, c.starts_at) <= NOW()""",
        task_id,
    )
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    team = await get_team_for_competition(db, task["competition_id"], user["id"])
    if not team:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Must be in a team to download data")

    configured_files = (task["scoring_config"] or {}).get("downloadable_files", [])
    if not configured_files:
        return {"files": []}
    if not isinstance(configured_files, list):
        raise HTTPException(status_code=500, detail="Task download configuration is invalid")
    if not storage:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Storage not available")

    try:
        from google.auth import default as auth_default
        from google.auth.transport import requests as auth_requests

        credentials, _ = auth_default()
        credentials.refresh(auth_requests.Request())

        client = _get_gcs_client()
        bucket = client.bucket(PARTICIPANT_DATA_BUCKET)

        files = []
        required_prefix = f"tasks/{task_id}/participant-data/"
        for item in configured_files[:50]:
            if not isinstance(item, dict) or not isinstance(item.get("key"), str):
                continue
            if not item["key"].startswith(required_prefix):
                logger.warning("Skipped participant file outside task prefix", extra={"task_id": task_id})
                continue
            blob = bucket.blob(item["key"])
            url = blob.generate_signed_url(
                version="v4",
                expiration=timedelta(hours=1),
                method="GET",
                service_account_email=credentials.service_account_email,
                access_token=credentials.token,
            )
            files.append({
                "name": str(item.get("name", "Download"))[:200],
                "description": str(item.get("description", ""))[:500],
                "size": item.get("size"),
                "url": url,
            })

        return {"files": files}

    except Exception:
        logger.exception("Failed to generate participant download links")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to generate download links")


@admin_router.get("/admin/tasks/{task_id}/code-submissions")
async def admin_code_upload_submissions(task_id: UUID, db: DB, admin: AdminUser):
    rows = await db.fetch(
        """
        SELECT s.id, s.status, s.queued_at, s.started_at, s.completed_at,
               s.upload_size_bytes, s.last_error, s.error_type,
               t.id as team_id, t.name as team_name, t.slug as team_slug,
               u.name as submitted_by,
               e.score, e.metrics, e.duration_ms, e.sandbox_exit_code, e.execution_logs,
               EXISTS(SELECT 1 FROM team_bans tb WHERE tb.team_id = t.id AND tb.task_id = s.task_id) as is_banned
        FROM submissions s
        JOIN tasks tk ON tk.id = s.task_id
        JOIN teams t ON t.id = s.team_id
        LEFT JOIN users u ON u.id = s.created_by
        LEFT JOIN evaluations e ON e.submission_id = s.id
        WHERE tk.id = $1 AND tk.submission_mode = 'code'
        ORDER BY s.queued_at DESC
        LIMIT 200
        """,
        task_id,
    )

    return [
        {
            "id": str(r["id"]),
            "status": r["status"],
            "team_id": str(r["team_id"]),
            "team_name": r["team_name"],
            "team_slug": r["team_slug"],
            "submitted_by": r["submitted_by"],
            "queued_at": r["queued_at"],
            "completed_at": r["completed_at"],
            "upload_size_bytes": r["upload_size_bytes"],
            "score": float(r["score"]) if r["score"] is not None else None,
            "category_scores": r["metrics"].get("category_scores") if isinstance(r["metrics"], dict) else None,
            "duration_ms": r["duration_ms"],
            "sandbox_exit_code": r["sandbox_exit_code"],
            "execution_logs": r["execution_logs"],
            "error_type": r["error_type"],
            "error_message": r["last_error"],
            "is_banned": r["is_banned"],
        }
        for r in rows
    ]


@admin_router.post("/admin/tasks/{task_id}/private-evaluations", status_code=status.HTTP_201_CREATED)
async def trigger_private_eval(
    task_id: UUID,
    db: DB,
    admin: AdminUser,
    evaluation_round: int = Query(ge=1, le=10000),
):
    task = await db.fetchrow("SELECT id FROM tasks WHERE id = $1", task_id)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    job_id = uuid_mod.uuid4()
    await db.execute(
        """INSERT INTO batch_jobs (id, task_id, job_type, status, config)
           VALUES ($1, $2, 'private_eval', 'pending', $3)
           ON CONFLICT DO NOTHING""",
        job_id,
        task["id"],
        {"evaluation_round": evaluation_round},
    )

    return {"job_id": str(job_id), "evaluation_round": evaluation_round, "status": "pending"}


@admin_router.get("/admin/tasks/{task_id}/private-evaluations/status")
async def get_private_eval_status(task_id: UUID, db: DB, admin: AdminUser):
    row = await db.fetchrow(
        """SELECT id, status, config, result, error, locked_by,
                  started_at, completed_at, created_at
           FROM batch_jobs
           WHERE job_type = 'private_eval' AND task_id = $1
           ORDER BY created_at DESC LIMIT 1""",
        task_id,
    )
    if not row:
        return {"status": "none"}

    result = row["result"] or {}
    config = row["config"] or {}
    return {
        "job_id": str(row["id"]),
        "status": row["status"],
        "evaluation_round": config.get("evaluation_round"),
        "locked_by": row["locked_by"],
        "progress": {
            "total": result.get("total_teams", 0),
            "succeeded": result.get("succeeded", 0),
            "failed": result.get("failed", 0),
            "current_team": result.get("current_team"),
        },
        "error": row["error"],
        "started_at": row["started_at"],
        "completed_at": row["completed_at"],
    }


@admin_router.get("/admin/tasks/{task_id}/private-evaluations")
async def get_private_eval_results(task_id: UUID, db: DB, admin: AdminUser):
    rows = await db.fetch(
        """SELECT pe.team_id, t.name AS team_name, t.slug AS team_slug,
                  pe.submission_id, pe.public_score, pe.private_score,
                  pe.private_category_scores, pe.evaluation_round, pe.evaluated_at
           FROM private_evaluations pe
           JOIN teams t ON t.id = pe.team_id
           WHERE pe.task_id = $1
           ORDER BY pe.evaluation_round DESC, pe.private_score DESC""",
        task_id,
    )

    return [
        {
            "team_id": str(r["team_id"]),
            "team_name": r["team_name"],
            "team_slug": r["team_slug"],
            "submission_id": str(r["submission_id"]),
            "public_score": float(r["public_score"]),
            "private_score": float(r["private_score"]),
            "average": round((float(r["public_score"]) + float(r["private_score"])) / 2, 4),
            "delta": round(float(r["public_score"]) - float(r["private_score"]), 4),
            "private_category_scores": r["private_category_scores"],
            "evaluation_round": r["evaluation_round"],
            "evaluated_at": r["evaluated_at"],
        }
        for r in rows
    ]


@admin_router.get("/admin/tasks/{task_id}/bans")
async def list_bans(task_id: UUID, db: DB, admin: AdminUser):
    task = await db.fetchrow("SELECT id FROM tasks WHERE id = $1", task_id)
    if not task:
        return []

    rows = await db.fetch(
        """
        SELECT tb.id, tb.team_id, t.name as team_name, t.slug as team_slug,
               tb.reason, u.name as banned_by_name, tb.banned_at
        FROM team_bans tb
        JOIN teams t ON t.id = tb.team_id
        LEFT JOIN users u ON u.id = tb.banned_by
        WHERE tb.task_id = $1
        ORDER BY tb.banned_at DESC
        """,
        task["id"],
    )

    return [
        {
            "id": str(r["id"]),
            "team_id": str(r["team_id"]),
            "team_name": r["team_name"],
            "team_slug": r["team_slug"],
            "reason": r["reason"],
            "banned_by": r["banned_by_name"],
            "banned_at": r["banned_at"],
        }
        for r in rows
    ]


class BanRequest(BaseModel):
    team_id: UUID
    reason: str = Field(..., min_length=1, max_length=500)


@admin_router.post("/admin/tasks/{task_id}/bans", status_code=status.HTTP_201_CREATED)
async def ban_team(task_id: UUID, db: DB, admin: AdminUser, body: BanRequest):
    task = await db.fetchrow("SELECT id, competition_id FROM tasks WHERE id = $1", task_id)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    team = await db.fetchrow(
        "SELECT id FROM teams WHERE id = $1 AND competition_id = $2",
        body.team_id,
        task["competition_id"],
    )
    if not team:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")

    await db.execute(
        """
        INSERT INTO team_bans (team_id, task_id, reason, banned_by)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (team_id, task_id) DO UPDATE SET reason = EXCLUDED.reason, banned_by = EXCLUDED.banned_by
        """,
        body.team_id, task["id"], body.reason, admin["id"],
    )

    logger.info("team_banned", extra={"team_id": body.team_id, "task_id": str(task["id"]), "reason": body.reason, "banned_by": str(admin["id"])})
    return {"banned": True}


@admin_router.delete("/admin/tasks/{task_id}/bans/{team_id}")
async def unban_team(task_id: UUID, team_id: UUID, db: DB, admin: AdminUser):
    task = await db.fetchrow("SELECT id FROM tasks WHERE id = $1", task_id)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    result = await db.execute(
        "DELETE FROM team_bans WHERE team_id = $1 AND task_id = $2",
        team_id, task["id"],
    )

    if "DELETE 0" in result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team is not banned")

    logger.info("team_unbanned", extra={"team_id": team_id, "task_id": str(task["id"]), "unbanned_by": str(admin["id"])})
    return {"unbanned": True}


@admin_router.get("/admin/tasks/{task_id}/code-stats")
async def admin_code_upload_stats(task_id: UUID, db: DB, admin: AdminUser):
    task = await db.fetchrow("SELECT id FROM tasks WHERE id = $1", task_id)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    task_id = task["id"]

    status_rows = await db.fetch(
        "SELECT status, count(*) as cnt FROM submissions WHERE task_id = $1 GROUP BY status",
        task_id,
    )
    status_counts = {r["status"]: r["cnt"] for r in status_rows}
    total_submissions = sum(status_counts.values())

    today_submissions = await db.fetchval(
        "SELECT count(*) FROM submissions WHERE task_id = $1 AND queued_at > CURRENT_DATE",
        task_id,
    )

    success_row = await db.fetchrow(
        """
        SELECT count(*) FILTER (WHERE status = 'completed') as completed,
               count(*) FILTER (WHERE status IN ('completed', 'failed', 'timeout')) as terminal
        FROM submissions WHERE task_id = $1
        """,
        task_id,
    )
    success_rate = round(success_row["completed"] / success_row["terminal"] * 100, 1) if success_row and success_row["terminal"] > 0 else 0.0

    teams_row = await db.fetchrow(
        """
        SELECT count(DISTINCT team_id) FILTER (WHERE queued_at > NOW() - INTERVAL '24 hours') as active_teams,
               count(DISTINCT team_id) as total_teams
        FROM submissions WHERE task_id = $1
        """,
        task_id,
    )

    avg_duration_ms = await db.fetchval(
        """
        SELECT avg(e.duration_ms) as avg_duration_ms
        FROM evaluations e JOIN submissions s ON s.id = e.submission_id
        WHERE s.task_id = $1 AND s.status = 'completed' AND e.duration_ms IS NOT NULL
          AND s.completed_at > NOW() - INTERVAL '24 hours'
        """,
        task_id,
    )

    error_rows = await db.fetch(
        """
        SELECT error_type, count(*) as cnt FROM submissions
        WHERE task_id = $1 AND error_type IS NOT NULL
        GROUP BY error_type ORDER BY cnt DESC
        """,
        task_id,
    )

    avg_wait_seconds = await db.fetchval(
        """
        SELECT avg(EXTRACT(EPOCH FROM (started_at - queued_at))) as avg_wait_seconds
        FROM submissions WHERE task_id = $1 AND started_at IS NOT NULL
          AND queued_at > NOW() - INTERVAL '24 hours'
        """,
        task_id,
    )

    failure_row = await db.fetchrow(
        """
        SELECT count(*) FILTER (WHERE status IN ('failed', 'timeout')) as failed,
               count(*) as total
        FROM submissions WHERE task_id = $1
          AND completed_at > NOW() - INTERVAL '1 hour'
          AND status IN ('completed', 'failed', 'timeout')
        """,
        task_id,
    )
    failure_rate_1h = round(failure_row["failed"] / failure_row["total"] * 100, 1) if failure_row and failure_row["total"] > 0 else 0.0

    team_rows = await db.fetch(
        """
        SELECT t.id as team_id, t.name as team_name, t.slug as team_slug,
               ls.best_score, ls.total_submissions, ls.last_submission_at,
               (SELECT e.score FROM evaluations e JOIN submissions s ON s.id = e.submission_id
                WHERE s.team_id = t.id AND s.task_id = $1 AND e.score IS NOT NULL
                ORDER BY s.queued_at ASC LIMIT 1) as first_score,
               (SELECT count(*) FROM submissions s
                WHERE s.team_id = t.id AND s.task_id = $1
                  AND s.queued_at > CURRENT_DATE) as today_submissions
        FROM leaderboard_scores ls
        JOIN teams t ON t.id = ls.team_id
        WHERE ls.task_id = $1
        ORDER BY ls.best_score DESC NULLS LAST
        """,
        task_id,
    )

    hourly_rows = await db.fetch(
        """
        SELECT date_trunc('hour', completed_at) as hour,
               count(*) FILTER (WHERE status = 'completed') as completed,
               count(*) FILTER (WHERE status IN ('failed', 'timeout')) as failed
        FROM submissions
        WHERE task_id = $1 AND completed_at > NOW() - INTERVAL '24 hours' AND completed_at IS NOT NULL
        GROUP BY hour ORDER BY hour
        """,
        task_id,
    )

    return {
        "overview": {
            "total_submissions": total_submissions,
            "today_submissions": today_submissions,
            "success_rate": success_rate,
            "active_teams": teams_row["active_teams"] if teams_row else 0,
            "total_teams": teams_row["total_teams"] if teams_row else 0,
            "queue_depth": status_counts.get("queued", 0),
            "processing": status_counts.get("processing", 0),
            "avg_duration_ms": round(avg_duration_ms) if avg_duration_ms else None,
            "avg_wait_seconds": round(avg_wait_seconds, 1) if avg_wait_seconds else None,
            "failure_rate_1h": failure_rate_1h,
            "failed_1h": failure_row["failed"] if failure_row else 0,
            "total_1h": failure_row["total"] if failure_row else 0,
        },
        "error_breakdown": [
            {"error_type": r["error_type"], "count": r["cnt"]}
            for r in error_rows
        ],
        "team_leaderboard": [
            {
                "rank": idx + 1,
                "team_id": str(r["team_id"]),
                "team_name": r["team_name"],
                "team_slug": r["team_slug"],
                "best_score": float(r["best_score"]) if r["best_score"] else None,
                "first_score": float(r["first_score"]) if r["first_score"] else None,
                "total_submissions": r["total_submissions"],
                "today_submissions": r["today_submissions"],
                "last_submission_at": r["last_submission_at"],
            }
            for idx, r in enumerate(team_rows)
        ],
        "hourly_activity": [
            {
                "hour": r["hour"].isoformat() if r["hour"] else None,
                "completed": r["completed"],
                "failed": r["failed"],
            }
            for r in hourly_rows
        ],
    }
