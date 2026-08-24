import satori from "satori"
import { Resvg } from "@resvg/resvg-js"
import { readFile } from "fs/promises"
import { join } from "path"
import { appName, appHost } from "@/lib/branding"

export const runtime = "nodejs"
export const alt = appName
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

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

export default async function Image() {
  const fonts = await loadFonts()

  const svg = await satori(
    <div style={{
      width: 1200,
      height: 630,
      display: "flex",
      flexDirection: "column",
      fontFamily: "Space Grotesk",
      color: "#F4F2F6",
      position: "relative",
    }}>
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

      <div style={{
        display: "flex",
        flex: 1,
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        position: "relative",
        gap: 32,
      }}>
        <div style={{
          fontSize: 88,
          fontWeight: 700,
          letterSpacing: 2,
          textTransform: "uppercase" as const,
          display: "flex",
          textAlign: "center",
        }}>
          {appName}
        </div>

        <div style={{
          width: 200,
          height: 2,
          background: "linear-gradient(90deg, transparent, #0853CD, transparent)",
          display: "flex",
          marginTop: 8,
          marginBottom: 8,
        }} />

        <div style={{
          fontSize: 32,
          fontWeight: 500,
          color: "#6B7FA0",
          letterSpacing: 4,
          textTransform: "uppercase" as const,
          display: "flex",
        }}>
          A task-oriented AI competition
        </div>
      </div>

      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "0 80px 40px",
        fontSize: 20,
        color: "#4A5B78",
        letterSpacing: 1,
      }}>
        <span style={{ display: "flex" }}>{appHost}</span>
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: "Space Grotesk", data: fonts.bold, weight: 700, style: "normal" as const },
        { name: "Space Grotesk", data: fonts.medium, weight: 500, style: "normal" as const },
      ],
    }
  )

  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: 1200 },
  })
  const png = resvg.render().asPng()

  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
    },
  })
}
