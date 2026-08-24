import { notFound } from "next/navigation"
import { Card } from "@/components/ui/card"
import { CheckCircle } from "lucide-react"
import { appName, appUrl } from "@/lib/branding"

export const dynamic = "force-dynamic"

const API_BASE = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8003"

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"]
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

interface VerifyData {
  valid: boolean
  certificate_code: string
  participant_name: string
  team_name: string
  overall_rank: number | null
  task_placements: { task_name: string; rank: number | null; total_teams: number }[]
  issued_at: string | null
}

async function getCertificate(code: string): Promise<VerifyData | null> {
  try {
    const res = await fetch(`${API_BASE}/certificate/verify/${code}`, { cache: "no-store" })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export default async function VerifyPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const data = await getCertificate(code)
  if (!data) notFound()

  const linkedInUrl = new URL("https://www.linkedin.com/sharing/share-offsite/")
  linkedInUrl.searchParams.set("url", `${appUrl}/certificate/verify/${data.certificate_code}`)

  const issuedDate = data.issued_at ? new Date(data.issued_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : null

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-lg w-full p-8">
        <div className="flex items-center gap-2 mb-6">
          <CheckCircle className="h-6 w-6 text-emerald-500" />
          <span className="text-emerald-600 dark:text-emerald-400 font-semibold text-lg">Verified Certificate</span>
        </div>

        <h1 className="text-2xl font-bold mb-1">{data.participant_name}</h1>
        <p className="text-muted-foreground mb-6">Team {data.team_name}</p>

        <div className="space-y-4 mb-6">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Competition</p>
            <p className="font-medium">{appName}</p>
          </div>

          {data.overall_rank && (
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Overall Placement</p>
              <p className="font-medium">{ordinal(data.overall_rank)} Place</p>
            </div>
          )}

          {data.task_placements && data.task_placements.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Task Rankings</p>
              <div className="grid grid-cols-3 gap-3">
                {data.task_placements.map((tp) => (
                  <div key={tp.task_name} className="bg-muted/50 rounded-lg p-3 text-center">
                    <p className="text-xs text-muted-foreground mb-1">{tp.task_name}</p>
                    <p className="font-bold text-lg">{tp.rank ? ordinal(tp.rank) : "\u2014"}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between text-sm text-muted-foreground pt-2 border-t">
            <span>{issuedDate ? `Issued: ${issuedDate}` : "Issued"}</span>
            <span className="font-mono text-xs">{data.certificate_code}</span>
          </div>
        </div>

        <a
          href={linkedInUrl.toString()}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 bg-[#0A66C2] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#004182] transition-colors"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
          </svg>
          Share on LinkedIn
        </a>
      </Card>
    </div>
  )
}
