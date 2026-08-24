import type { Metadata } from "next"
import TeamPageClient from "./_components/team-page-client"
import { API_BASE } from "@/lib/api"
import { appName, appUrl } from "@/lib/branding"

interface TeamData {
  name: string
  members: { name: string }[]
}

async function fetchTeam(slug: string): Promise<TeamData | null> {
  try {
    const res = await fetch(`${API_BASE}/teams/by-slug/${slug}`, {
      next: { revalidate: 60 },
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const team = await fetchTeam(slug)
  if (!team) {
    return { title: `Team not found — ${appName}` }
  }

  const memberNames = team.members.map((m) => m.name.split(" ")[0]).join(",")
  const ogUrl = `${appUrl}/og?type=competing&team=${encodeURIComponent(team.name)}&members=${encodeURIComponent(memberNames)}`
  const title = `${team.name} — ${appName}`
  const description = `${team.name} is competing in ${appName}!`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [{ url: ogUrl, width: 1080, height: 1080, alt: `${team.name} — ${appName}` }],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogUrl],
    },
  }
}

export default async function TeamPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <TeamPageClient slug={slug} />
}
