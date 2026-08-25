"use client"

import { useState, useEffect, useCallback } from "react"
import { ThemeLogo } from "@/components/theme-logo"
import { appName } from "@/lib/branding"
import { LivestreamLeaderboard } from "./_components/livestream-leaderboard"
import { LivestreamSubmissions } from "./_components/livestream-submissions"
import { LivestreamStats } from "./_components/livestream-stats"

const CYCLE_INTERVAL = 20_000
const VIEW_COUNT = 3

const VIEW_LABELS = ["Leaderboard", "Recent Submissions", "Competition Stats"]

export default function LivestreamPage() {
  const [currentView, setCurrentView] = useState(0)
  const [viewKey, setViewKey] = useState(0)
  const [fade, setFade] = useState(true)

  const cycleView = useCallback(() => {
    setFade(false)
    setTimeout(() => {
      setCurrentView((prev) => (prev + 1) % VIEW_COUNT)
      setViewKey((prev) => prev + 1)
      setFade(true)
    }, 300)
  }, [])

  useEffect(() => {
    const interval = setInterval(cycleView, CYCLE_INTERVAL)
    return () => clearInterval(interval)
  }, [cycleView])

  return (
    <div className="min-h-screen flex flex-col px-8 py-6">
      <header className="flex items-center justify-between mb-6 shrink-0">
        <ThemeLogo width={180} height={90} />
        <div className="flex items-center gap-6">
          <div className="flex gap-2">
            {VIEW_LABELS.map((label, i) => (
              <button
                key={label}
                onClick={() => {
                  setFade(false)
                  setTimeout(() => {
                    setCurrentView(i)
                    setViewKey((prev) => prev + 1)
                    setFade(true)
                  }, 300)
                }}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  currentView === i
                    ? "bg-foreground text-background"
                    : "bg-muted/50 text-muted-foreground hover:bg-muted"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
            </span>
            <span className="text-sm font-medium">LIVE</span>
          </div>
        </div>
      </header>

      <div className="mb-4 shrink-0">
        <h1 className="text-4xl font-bold tracking-tight">{VIEW_LABELS[currentView]}</h1>
        <p className="text-muted-foreground text-lg mt-1">{appName}</p>
      </div>

      <div
        className="flex-1 transition-opacity duration-300"
        style={{ opacity: fade ? 1 : 0 }}
      >
        {currentView === 0 && <LivestreamLeaderboard key={viewKey} />}
        {currentView === 1 && <LivestreamSubmissions key={viewKey} />}
        {currentView === 2 && <LivestreamStats key={viewKey} />}
      </div>
    </div>
  )
}
