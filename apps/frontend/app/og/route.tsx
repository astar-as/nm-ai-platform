import satori from "satori"
import { Resvg } from "@resvg/resvg-js"
import { NextRequest, NextResponse } from "next/server"
import { readFile } from "fs/promises"
import { join } from "path"
import { appName, appHost } from "@/lib/branding"

export const runtime = "nodejs"

let fontBoldData: ArrayBuffer | null = null
let fontMediumData: ArrayBuffer | null = null

async function loadFonts() {
  if (!fontBoldData) {
    const boldPath = join(process.cwd(), "public/fonts/SpaceGrotesk-Bold.ttf")
    const mediumPath = join(process.cwd(), "public/fonts/SpaceGrotesk-Medium.ttf")
    const [bold, medium] = await Promise.all([
      readFile(boldPath),
      readFile(mediumPath),
    ])
    fontBoldData = bold.buffer.slice(bold.byteOffset, bold.byteOffset + bold.byteLength)
    fontMediumData = medium.buffer.slice(medium.byteOffset, medium.byteOffset + medium.byteLength)
  }
  return { bold: fontBoldData!, medium: fontMediumData! }
}

function AppWordmark({ fill }: { fill: string }) {
  return (
    <div style={{
      display: "flex",
      fontSize: 56,
      fontWeight: 700,
      letterSpacing: 2,
      textTransform: "uppercase" as const,
      color: fill,
    }}>
      {appName}
    </div>
  )
}

interface Theme {
  text: string
  muted: string
  subtle: string
  cardBg: string
  cardBorder: string
  dividerFrom: string
  logoFill: string
}

const DARK: Theme = {
  text: "#F4F2F6",
  muted: "#6B7FA0",
  subtle: "#4A5B78",
  cardBg: "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)",
  cardBorder: "1px solid rgba(255,255,255,0.06)",
  dividerFrom: "#0853CD",
  logoFill: "#F4F2F6",
}

const LIGHT: Theme = {
  text: "#111F38",
  muted: "#5A6B80",
  subtle: "#8494A7",
  cardBg: "linear-gradient(135deg, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0.5) 100%)",
  cardBorder: "1px solid rgba(255,255,255,0.8)",
  dividerFrom: "#0853CD",
  logoFill: "#111F38",
}

function DarkBackground() {
  return (
    <div style={{
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: "linear-gradient(145deg, #111F38 0%, #0A1220 100%)",
      display: "flex",
    }}>
      <div style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: 6,
        background: "linear-gradient(90deg, #0853CD 0%, #A91F38 100%)",
        display: "flex",
      }} />
    </div>
  )
}

function LightBackground() {
  return (
    <div style={{
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: "#e0e8f0",
      display: "flex",
    }}>
      <div style={{
        position: "absolute",
        top: -200,
        left: -200,
        width: 800,
        height: 800,
        borderRadius: 9999,
        background: "radial-gradient(circle, rgba(10,80,100,0.25) 0%, transparent 70%)",
        display: "flex",
      }} />
      <div style={{
        position: "absolute",
        bottom: -150,
        right: -150,
        width: 700,
        height: 700,
        borderRadius: 9999,
        background: "radial-gradient(circle, rgba(150,20,90,0.28) 0%, transparent 70%)",
        display: "flex",
      }} />
      <div style={{
        position: "absolute",
        top: 300,
        left: 300,
        width: 700,
        height: 700,
        borderRadius: 9999,
        background: "radial-gradient(circle, rgba(192,160,176,0.22) 0%, transparent 70%)",
        display: "flex",
      }} />
      <div style={{
        position: "absolute",
        top: 100,
        right: 100,
        width: 500,
        height: 500,
        borderRadius: 9999,
        background: "radial-gradient(circle, rgba(80,112,144,0.18) 0%, transparent 70%)",
        display: "flex",
      }} />
      <div style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: 6,
        background: "linear-gradient(90deg, #0853CD 0%, #A91F38 100%)",
        display: "flex",
      }} />
    </div>
  )
}

function Footer({ theme, isLight }: { theme: Theme; isLight: boolean }) {
  return (
    <div style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "0 80px 60px",
      fontSize: 20,
      color: theme.subtle,
      letterSpacing: 1,
    }}>
      <span style={{ display: "flex", color: isLight ? "#0853CD" : theme.subtle }}>{appHost}</span>
    </div>
  )
}

function CompetingCard({ teamName, members, theme, isLight }: { teamName: string; members: string[]; theme: Theme; isLight: boolean }) {
  return (
    <div style={{
      width: 1200,
      height: 1200,
      display: "flex",
      flexDirection: "column",
      fontFamily: "Space Grotesk",
      color: theme.text,
      position: "relative",
    }}>
      {isLight ? <LightBackground /> : <DarkBackground />}

      <div style={{
        display: "flex",
        justifyContent: "center",
        padding: "72px 0 0",
        position: "relative",
      }}>
        <AppWordmark fill={theme.logoFill} />
      </div>

      <div style={{
        display: "flex",
        flex: 1,
        flexDirection: "column",
        justifyContent: "center",
        padding: "0 80px",
        position: "relative",
      }}>
        <div style={{
          display: "flex",
          flexDirection: "column",
          background: theme.cardBg,
          border: theme.cardBorder,
          borderRadius: 24,
          padding: "60px 56px",
        }}>
          <div style={{
            fontSize: 24,
            fontWeight: 500,
            color: theme.muted,
            letterSpacing: 5,
            textTransform: "uppercase" as const,
            display: "flex",
          }}>
            WE&apos;RE COMPETING IN
          </div>
          <div style={{
            fontSize: 80,
            fontWeight: 700,
            letterSpacing: -2,
            marginTop: 8,
            display: "flex",
          }}>
            {appName}
          </div>

          <div style={{
            width: "100%",
            height: 2,
            background: `linear-gradient(90deg, ${theme.dividerFrom}, rgba(169,31,56,0.3), transparent)`,
            marginTop: 44,
            marginBottom: 44,
            display: "flex",
          }} />

          <div style={{
            fontSize: 48,
            fontWeight: 700,
            display: "flex",
            maxWidth: 960,
            overflow: "hidden",
          }}>
            Team &ldquo;{teamName}&rdquo;
          </div>
          <div style={{
            fontSize: 24,
            color: theme.muted,
            marginTop: 16,
            display: "flex",
          }}>
            {members.join("  ·  ")}
          </div>
        </div>
      </div>

      <Footer theme={theme} isLight={isLight} />
    </div>
  )
}

function RankingCard({ teamName, rank, theme, isLight }: { teamName: string; rank: number | null; theme: Theme; isLight: boolean }) {
  return (
    <div style={{
      width: 1200,
      height: 1200,
      display: "flex",
      flexDirection: "column",
      fontFamily: "Space Grotesk",
      color: theme.text,
      position: "relative",
    }}>
      {isLight ? <LightBackground /> : <DarkBackground />}

      <div style={{
        display: "flex",
        justifyContent: "center",
        padding: "72px 0 0",
        position: "relative",
      }}>
        <AppWordmark fill={theme.logoFill} />
      </div>

      <div style={{
        display: "flex",
        flex: 1,
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        padding: "0 80px",
        position: "relative",
      }}>
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          background: theme.cardBg,
          border: theme.cardBorder,
          borderRadius: 24,
          padding: "56px 80px",
          width: "100%",
        }}>
          <div style={{
            fontSize: 180,
            fontWeight: 700,
            lineHeight: 1,
            letterSpacing: -6,
            color: rank ? theme.text : theme.subtle,
            display: "flex",
          }}>
            {rank ? `#${rank}` : "—"}
          </div>

          <div style={{
            width: 200,
            height: 2,
            background: `linear-gradient(90deg, transparent, ${theme.dividerFrom}, transparent)`,
            marginTop: 40,
            marginBottom: 40,
            display: "flex",
          }} />

          <div style={{
            fontSize: 48,
            fontWeight: 700,
            display: "flex",
            textAlign: "center",
          }}>
            Team &ldquo;{teamName}&rdquo;
          </div>
          <div style={{
            fontSize: 24,
            color: theme.muted,
            marginTop: 12,
            display: "flex",
          }}>
            {rank ? "Leaderboard" : "Not yet ranked"}
          </div>
        </div>
      </div>

      <Footer theme={theme} isLight={isLight} />
    </div>
  )
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const type = searchParams.get("type") || "competing"
  const teamName = searchParams.get("team") || "Team"
  const membersParam = searchParams.get("members") || ""
  const members = membersParam ? membersParam.split(",") : []
  const rank = searchParams.get("rank") ? parseInt(searchParams.get("rank")!) : null
  const themeParam = searchParams.get("theme") || "dark"

  const fonts = await loadFonts()
  const isLight = themeParam === "light"
  const theme = isLight ? LIGHT : DARK

  const card = type === "ranking"
    ? <RankingCard teamName={teamName} rank={rank} theme={theme} isLight={isLight} />
    : <CompetingCard teamName={teamName} members={members} theme={theme} isLight={isLight} />

  const svg = await satori(card, {
    width: 1200,
    height: 1200,
    fonts: [
      { name: "Space Grotesk", data: fonts.bold, weight: 700, style: "normal" as const },
      { name: "Space Grotesk", data: fonts.medium, weight: 500, style: "normal" as const },
    ],
  })

  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: 1200 },
  })
  const png = resvg.render().asPng()

  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  })
}
