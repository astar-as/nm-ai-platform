"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { FileText, Hash, Search } from "lucide-react"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import type { SearchEntry } from "@/lib/docs"

interface SearchResult {
  slug: string
  title: string
  section: string
  matchedHeading?: { id: string; title: string }
}

function getHref(result: SearchResult) {
  const base = result.slug === "getting-started" ? "/docs" : `/docs/${result.slug}`
  if (result.matchedHeading) return `${base}#${result.matchedHeading.id}`
  return base
}

export function DocsSearch({ entries }: { entries: SearchEntry[] }) {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    document.addEventListener("keydown", handleKey)
    return () => document.removeEventListener("keydown", handleKey)
  }, [])

  const filter = useCallback(
    (value: string, search: string) => {
      const entry = entries.find(
        (e) => e.slug === value || e.headings.some((h) => `${e.slug}#${h.id}` === value)
      )
      if (!entry) return 0
      const q = search.toLowerCase()
      if (entry.title.toLowerCase().includes(q)) return 1
      if (entry.headings.some((h) => h.title.toLowerCase().includes(q))) return 0.8
      if (entry.plainText.toLowerCase().includes(q)) return 0.5
      return 0
    },
    [entries]
  )

  function navigate(value: string) {
    const entry = entries.find((e) => e.slug === value)
    if (entry) {
      router.push(getHref({ slug: entry.slug, title: entry.title, section: entry.section }))
      setOpen(false)
      return
    }
    for (const e of entries) {
      const heading = e.headings.find((h) => `${e.slug}#${h.id}` === value)
      if (heading) {
        router.push(getHref({ slug: e.slug, title: e.title, section: e.section, matchedHeading: heading }))
        setOpen(false)
        return
      }
    }
  }

  const grouped = entries.reduce<Record<string, SearchEntry[]>>((acc, entry) => {
    const section = entry.section
    if (!acc[section]) acc[section] = []
    acc[section].push(entry)
    return acc
  }, {})

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 w-full px-2.5 h-8 text-xs text-muted-foreground border border-border/60 rounded-md hover:bg-muted/50 transition-colors mb-4"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="flex-1 text-left">Search docs...</span>
        <kbd className="text-[10px] text-muted-foreground/60 border border-border/40 rounded px-1 py-0.5">
          ⌘K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen} filter={filter}>
        <CommandInput placeholder="Search documentation..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          {Object.entries(grouped).map(([section, sectionEntries]) => (
            <CommandGroup key={section} heading={section}>
              {sectionEntries.map((entry) => (
                <CommandItem
                  key={entry.slug}
                  value={entry.slug}
                  onSelect={navigate}
                  className="flex items-center gap-2"
                >
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span>{entry.title}</span>
                </CommandItem>
              ))}
              {sectionEntries.flatMap((entry) =>
                entry.headings.map((h) => (
                  <CommandItem
                    key={`${entry.slug}#${h.id}`}
                    value={`${entry.slug}#${h.id}`}
                    onSelect={navigate}
                    className="flex items-center gap-2 pl-8"
                  >
                    <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">{entry.title}</span>
                    <span>› {h.title}</span>
                  </CommandItem>
                ))
              )}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  )
}
