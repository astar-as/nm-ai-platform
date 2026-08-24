import re
from urllib.parse import urlsplit, urlunsplit

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field, field_validator

from app.dependencies import DB, CurrentUser

router = APIRouter()


class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    avatar_url: str | None
    auth_provider: str | None = None
    occupation: str | None = None
    github_username: str | None = None
    linkedin_url: str | None = None
    x_username: str | None = None
    is_admin: bool = False


class UserUpdate(BaseModel):
    name: str | None = Field(None, max_length=100)
    occupation: str | None = Field(None, max_length=100)
    github_username: str | None = Field(None, max_length=100)
    linkedin_url: str | None = Field(None, max_length=255)
    x_username: str | None = Field(None, max_length=100)

    @field_validator("name", "occupation")
    @classmethod
    def clean_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if not cleaned and value:
            raise ValueError("Value cannot contain only whitespace")
        return cleaned or None

    @field_validator("github_username")
    @classmethod
    def validate_github_username(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        value = value.strip().removeprefix("@")
        if not re.fullmatch(r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?", value):
            raise ValueError("Invalid GitHub username")
        return value

    @field_validator("x_username")
    @classmethod
    def validate_x_username(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        value = value.strip().removeprefix("@")
        if not re.fullmatch(r"[A-Za-z0-9_]{1,15}", value):
            raise ValueError("Invalid X username")
        return value

    @field_validator("linkedin_url")
    @classmethod
    def validate_linkedin_url(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        parsed = urlsplit(value.strip())
        hostname = (parsed.hostname or "").lower()
        if (
            parsed.scheme.lower() != "https"
            or (hostname != "linkedin.com" and not hostname.endswith(".linkedin.com"))
            or parsed.username
            or parsed.password
        ):
            raise ValueError("LinkedIn URL must use https://linkedin.com")
        return urlunsplit(("https", parsed.netloc.lower(), parsed.path, parsed.query, ""))


def _user_response(row) -> UserResponse:
    return UserResponse(
        id=str(row["id"]),
        email=row["email"],
        name=row["name"],
        avatar_url=row["avatar_url"],
        auth_provider=row["auth_provider"],
        occupation=row["occupation"],
        github_username=row["github_username"],
        linkedin_url=row["linkedin_url"],
        x_username=row["x_username"],
        is_admin=row.get("is_admin", False),
    )


_USER_SELECT = """
    SELECT u.id, u.email, u.name, u.avatar_url, u.auth_provider,
           u.occupation, u.github_username, u.linkedin_url, u.x_username,
           u.is_admin
    FROM users u
"""


@router.get("/me", response_model=UserResponse)
async def get_me(db: DB, user: CurrentUser):
    row = await db.fetchrow(f"{_USER_SELECT} WHERE u.id = $1", user["id"])
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    return _user_response(row)


@router.patch("/me", response_model=UserResponse)
async def update_me(data: UserUpdate, db: DB, user: CurrentUser):
    updates = []
    values = []
    idx = 1

    if data.name is not None:
        updates.append(f"name = ${idx}")
        values.append(data.name)
        idx += 1

    if data.occupation is not None:
        updates.append(f"occupation = ${idx}")
        values.append(data.occupation)
        idx += 1

    if data.github_username is not None:
        updates.append(f"github_username = ${idx}")
        values.append(data.github_username)
        idx += 1

    if data.linkedin_url is not None:
        updates.append(f"linkedin_url = ${idx}")
        values.append(data.linkedin_url)
        idx += 1

    if data.x_username is not None:
        updates.append(f"x_username = ${idx}")
        values.append(data.x_username)
        idx += 1

    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update")

    values.append(user["id"])
    await db.execute(f"UPDATE users SET {', '.join(updates)} WHERE id = ${idx}", *values)

    row = await db.fetchrow(f"{_USER_SELECT} WHERE u.id = $1", user["id"])
    return _user_response(row)
