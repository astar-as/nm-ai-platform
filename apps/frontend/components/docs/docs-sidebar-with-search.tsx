"use client"

import { DocsSearch } from "./docs-search"
import { DocsSidebar } from "./docs-sidebar"
import type { SearchEntry } from "@/lib/docs"
import type { DocNavSection } from "@/lib/docs-nav"

export function DocsSidebarWithSearch({ entries, nav }: { entries: SearchEntry[]; nav: DocNavSection[] }) {
  return (
    <>
      <DocsSearch entries={entries} />
      <DocsSidebar nav={nav} />
    </>
  )
}
