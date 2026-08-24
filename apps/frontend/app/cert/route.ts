import React from "react"
import crypto from "crypto"
import { renderToBuffer } from "@react-pdf/renderer"
import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { registerFonts } from "./fonts"
import {
  CertificateDocument,
  type CertificateData,
} from "./certificate-template"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const API_BASE = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8003"

// Simple in-memory cache: token -> { pdf bytes, timestamp }
const cache = new Map<string, { pdf: Uint8Array; timestamp: number }>()
const CACHE_TTL_MS = 60_000
const CACHE_MAX_ENTRIES = 500

function getCached(key: string): Uint8Array | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key)
    return null
  }
  return entry.pdf
}

export async function GET() {
  const cookieStore = await cookies()
  const token = cookieStore.get("access_token")?.value
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const cacheKey = crypto.createHash("sha256").update(token).digest("hex")

  const cached = getCached(cacheKey)
  if (cached) {
    return new Response(cached as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition":
          'attachment; filename="certificate.pdf"',
        "Cache-Control": "private, max-age=60",
      },
    })
  }

  // Fetch certificate data from backend
  const res = await fetch(`${API_BASE}/certificate/data`, {
    headers: { Cookie: `access_token=${token}` },
  })

  if (!res.ok) {
    const body = await res
      .json()
      .catch(() => ({ detail: "Unknown error" }))
    return NextResponse.json(
      { error: body.detail || "Failed to fetch certificate data" },
      { status: res.status }
    )
  }

  const apiData = await res.json()

  // Determine tier
  let tier: CertificateData["tier"] = "standard"
  if (apiData.overall_rank === 1) tier = "gold"
  else if (apiData.overall_rank === 2) tier = "silver"
  else if (apiData.overall_rank === 3) tier = "bronze"

  const certData: CertificateData = {
    participantName: apiData.participant_name,
    teamName: apiData.team_name,
    overallRank: apiData.overall_rank,
    totalTeams: apiData.total_teams,
    taskPlacements: apiData.task_placements.map(
      (tp: {
        task_name: string
        rank: number | null
        total_teams: number
      }) => ({
        taskName: tp.task_name,
        rank: tp.rank,
        totalTeams: tp.total_teams,
      })
    ),
    tier,
    certificateCode: apiData.certificate_code,
  }

  await registerFonts()

  const doc = React.createElement(CertificateDocument, { data: certData })
  // CertificateDocument returns a react-pdf <Document>, but the wrapper
  // component type doesn't satisfy renderToBuffer's generic constraint.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer = await renderToBuffer(doc as any)

  // Slugify name for filename
  const slugName =
    (apiData.participant_name || "participant")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "participant"
  const filename = `certificate-${slugName}.pdf`

  // Bound memory use for long-lived frontend processes.
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value
    if (oldestKey) cache.delete(oldestKey)
  }
  cache.set(cacheKey, { pdf: new Uint8Array(buffer), timestamp: Date.now() })

  return new Response(buffer as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, max-age=60",
    },
  })
}
