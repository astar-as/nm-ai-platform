"use client"

import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { appName } from "@/lib/branding"

const placements = [
  { place: "1st Place", accent: "text-amber-500" },
  { place: "2nd Place", accent: "text-zinc-400" },
  { place: "3rd Place", accent: "text-amber-700 dark:text-amber-600" },
]

export function PrizesOverview() {
  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div className="text-center space-y-3">
        <h1 className="text-3xl font-bold tracking-tight">Prizes</h1>
        <p className="text-muted-foreground">
          {appName}
        </p>
      </div>

      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle className="text-lg">Placement Prizes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-0">
          {placements.map((p, i) => (
            <div key={i} className={`flex items-center justify-between py-4 ${i > 0 ? "border-t" : ""}`}>
              <span className={`font-semibold text-base ${p.accent}`}>{p.place}</span>
              <span className="font-bold text-lg tabular-nums text-muted-foreground">Announced by the organizers</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">How It Works</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="text-sm space-y-3">
            <BulletItem>Your overall score is the <strong>configured weighted average of normalized scores</strong> across all tasks.</BulletItem>
            <BulletItem>Prize amounts, eligibility criteria, and payout terms are published by the organizers.</BulletItem>
            <BulletItem>Any required final materials must be submitted through the platform before the announced deadline.</BulletItem>
          </ul>
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground">
        See the full <Link href="/rules" className="underline hover:text-foreground">competition rules</Link> for
        eligibility requirements, team rules, and scoring details.
      </p>
    </div>
  )
}

function BulletItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="text-muted-foreground mt-0.5 shrink-0">&#8226;</span>
      <span>{children}</span>
    </li>
  )
}
