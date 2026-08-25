"use client"

import { useState } from "react"
import { Copy, Check } from "lucide-react"

export function CopyPageButton() {
  const [copied, setCopied] = useState(false)

  return (
    <button
      onClick={() => {
        const article = document.querySelector("article.prose")
        if (!article) return
        navigator.clipboard.writeText(article.textContent || "")
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }}
      className="flex items-center gap-1.5 rounded-md border border-border/40 px-3 min-h-11 text-xs text-muted-foreground transition-colors hover:text-foreground hover:border-border"
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5" />
          Copied
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5" />
          Copy page
        </>
      )}
    </button>
  )
}
