import { Font } from "@react-pdf/renderer"
import { readFile } from "fs/promises"
import { join } from "path"

let registered = false

export async function registerFonts() {
  if (registered) return
  const boldPath = join(process.cwd(), "public/fonts/SpaceGrotesk-Bold.ttf")
  const mediumPath = join(
    process.cwd(),
    "public/fonts/SpaceGrotesk-Medium.ttf"
  )
  const [bold, medium] = await Promise.all([
    readFile(boldPath),
    readFile(mediumPath),
  ])

  const boldDataUrl = `data:font/truetype;base64,${bold.toString("base64")}`
  const mediumDataUrl = `data:font/truetype;base64,${medium.toString("base64")}`

  Font.register({
    family: "SpaceGrotesk",
    fonts: [
      { src: mediumDataUrl, fontWeight: "normal" },
      { src: boldDataUrl, fontWeight: "bold" },
    ],
  })
  registered = true
}
