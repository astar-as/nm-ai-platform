"use client"

import { useState, useCallback } from "react"
import { Share2, Loader2, Sun, Moon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { appName, appUrl } from "@/lib/branding"
import type { TeamMember } from "@/types/auth"

type CardType = "competing" | "ranking"
type CardTheme = "dark" | "light"

interface ShareModalProps {
  teamName: string
  members: TeamMember[]
  rank: number | null
}

function shareCompeting(name: string) {
  return `Our team "${name}" is competing in ${appName}!\n\n${appUrl}`
}

function shareRanking(name: string, rank: number) {
  return `Team "${name}" is ranked #${rank} in ${appName}!\n\n${appUrl}`
}

export function ShareModal({ teamName, members, rank }: ShareModalProps) {
  const [open, setOpen] = useState(false)
  const [activeCard, setActiveCard] = useState<CardType>("competing")
  const [cardTheme, setCardTheme] = useState<CardTheme>("dark")
  const [isCapturing, setIsCapturing] = useState(false)

  const memberNames = members.map((m) => m.name.split(" ")[0])

  const getImageUrl = useCallback(() => {
    const params = new URLSearchParams({
      type: activeCard,
      team: teamName,
      members: memberNames.join(","),
      theme: cardTheme,
    })
    if (rank !== null) params.set("rank", String(rank))
    return `/og?${params.toString()}`
  }, [activeCard, teamName, memberNames, rank, cardTheme])

  const getShareText = useCallback(() => {
    if (activeCard === "competing") {
      return shareCompeting(teamName)
    }
    return shareRanking(teamName, rank ?? 0)
  }, [activeCard, teamName, rank])

  function getFileName() {
    return `share-${activeCard}-${teamName.toLowerCase().replace(/\s+/g, "-")}.png`
  }

  async function handleShare() {
    setIsCapturing(true)
    try {
      const res = await fetch(getImageUrl())
      if (!res.ok) return
      const blob = await res.blob()
      const file = new File([blob], getFileName(), { type: "image/png" })
      const text = getShareText()

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ text, files: [file] })
        return
      }

      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = getFileName()
      a.click()
      URL.revokeObjectURL(url)
      toast.success("Image downloaded!")
    } finally {
      setIsCapturing(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Share2 className="h-4 w-4" />
          Share
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Share</DialogTitle>
            <button
              onClick={() => setCardTheme(cardTheme === "dark" ? "light" : "dark")}
              className="flex items-center justify-center min-h-11 min-w-11 rounded-lg border border-border text-muted-foreground hover:bg-muted transition-colors"
            >
              {cardTheme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </DialogHeader>

        <div className="flex gap-3 mt-2">
          <button
            onClick={() => setActiveCard("competing")}
            className={cn(
              "flex-1 rounded-lg border-2 p-3 text-left text-sm font-medium transition-colors",
              activeCard === "competing"
                ? "border-foreground bg-muted text-foreground"
                : "border-border text-muted-foreground hover:border-muted-foreground"
            )}
          >
            We&apos;re competing
          </button>
          <button
            onClick={() => setActiveCard("ranking")}
            className={cn(
              "flex-1 rounded-lg border-2 p-3 text-left text-sm font-medium transition-colors",
              activeCard === "ranking"
                ? "border-foreground bg-muted text-foreground"
                : "border-border text-muted-foreground hover:border-muted-foreground"
            )}
          >
            Our ranking
          </button>
        </div>

        <div className="mt-3 rounded-lg overflow-hidden border border-border">
          <div style={{ width: "100%", aspectRatio: "1/1", position: "relative", overflow: "hidden" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={getImageUrl()}
              alt="Share card preview"
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </div>
        </div>

        <Button onClick={handleShare} disabled={isCapturing} className="mt-3 gap-2 w-full">
          {isCapturing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
          Share
        </Button>
      </DialogContent>
    </Dialog>
  )
}
