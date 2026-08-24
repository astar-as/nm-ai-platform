"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import type { TocItem } from "@/lib/docs"

export function DocsToc({ items }: { items: TocItem[] }) {
  const [activeId, setActiveId] = useState<string>("")

  useEffect(() => {
    const headings = items
      .map((item) => document.getElementById(item.id))
      .filter(Boolean) as HTMLElement[]

    if (headings.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id)
            break
          }
        }
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0 }
    )

    headings.forEach((h) => observer.observe(h))
    return () => observer.disconnect()
  }, [items])

  if (items.length === 0) return null

  return (
    <div>
      <ul className="space-y-0.5 border-l border-border/40">
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              onClick={(e) => {
                e.preventDefault()
                document.getElementById(item.id)?.scrollIntoView({
                  behavior: "smooth",
                  block: "start",
                })
                setActiveId(item.id)
              }}
              className={cn(
                "-ml-px block border-l-2 py-1 text-xs no-underline transition-colors",
                item.level === 3 ? "pl-5" : "pl-3",
                activeId === item.id
                  ? "border-primary text-primary font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              )}
            >
              {item.title}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
