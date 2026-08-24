"use client"

import { Menu } from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { DocsSidebar } from "./docs-sidebar"
import { DocsSearch } from "./docs-search"
import type { SearchEntry } from "@/lib/docs"
import type { DocNavSection } from "@/lib/docs-nav"

export function DocsMobileNav({ entries, nav }: { entries?: SearchEntry[]; nav: DocNavSection[] }) {
  return (
    <div className="mb-4 lg:hidden flex items-center gap-2">
      <Sheet>
        <SheetTrigger className="flex items-center gap-2 rounded-md px-3 min-h-11 text-sm text-muted-foreground hover:text-foreground transition-colors border border-border/40">
          <Menu className="h-4 w-4" />
          Navigation
        </SheetTrigger>
        <SheetContent side="left" className="w-72 p-0">
          <SheetHeader className="border-b border-border/40 px-4 py-3">
            <SheetTitle className="text-sm">Documentation</SheetTitle>
          </SheetHeader>
          <div className="overflow-y-auto p-4">
            {entries && <DocsSearch entries={entries} />}
            <DocsSidebar nav={nav} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
