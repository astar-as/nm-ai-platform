"use client"

import { useState } from "react"
import { useSearchParams } from "next/navigation"
import { Linkedin, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { toast } from "sonner"
import { appName, appUrl } from "@/lib/branding"

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

interface JoinedBannerProps {
  teamName: string
  memberNames: string[]
}

export function JoinedBanner({ teamName, memberNames }: JoinedBannerProps) {
  const searchParams = useSearchParams()
  const isJoined = searchParams.get("joined") === "1"
  const [dismissed, setDismissed] = useState(false)

  if (!isJoined || dismissed) {
    return null
  }

  if (typeof window !== "undefined" && window.location.search.includes("joined=1")) {
    window.history.replaceState({}, "", "/dashboard")
  }

  const ogUrl = `/og?type=competing&team=${encodeURIComponent(teamName)}&members=${encodeURIComponent(memberNames.join(","))}`

  const shareText = `Our team "${teamName}" is competing in ${appName}!\n\n${appUrl}`

  async function shareToLinkedIn() {
    try {
      const res = await fetch(ogUrl)
      const blob = await res.blob()
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ])
      toast.success("Image copied! Paste it into your post.")
    } catch {
      toast.info("Download the image and attach it to your post.")
    }
    window.open("https://www.linkedin.com/feed/?shareActive=true", "_blank")
  }

  function shareToX() {
    const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`
    window.open(tweetUrl, "_blank", "width=600,height=400")
  }

  return (
    <Card className="border-green-500/20 bg-green-500/5">
      <CardContent className="py-5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1">
            <p className="text-lg font-semibold">You&apos;re competing in {appName}!</p>
            <p className="text-sm text-muted-foreground mt-1">
              Let the world know you&apos;re in — share it with your network.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={shareToLinkedIn} variant="outline" size="sm" className="gap-2">
              <Linkedin className="h-4 w-4" />
              LinkedIn
            </Button>
            <Button onClick={shareToX} variant="outline" size="sm" className="gap-2">
              <XIcon className="h-3.5 w-3.5" />
            </Button>
            <Button onClick={() => setDismissed(true)} variant="ghost" size="icon" className="min-h-11 min-w-11">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
