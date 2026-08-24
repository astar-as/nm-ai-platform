"use client"

import { Suspense } from "react"
import dynamic from "next/dynamic"

const LeaderboardRevealed = dynamic(
  () => import("./leaderboard-revealed").then(m => ({ default: m.LeaderboardRevealed })),
  { ssr: false }
)

export function LeaderboardGate() {
  return (
    <Suspense>
      <LeaderboardRevealed />
    </Suspense>
  )
}
