import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"
import type { DocNavItem } from "@/lib/docs-nav"
import { slugToHref } from "@/lib/docs-nav"

export function DocsPrevNext({
  prev,
  next,
}: {
  prev: DocNavItem | null
  next: DocNavItem | null
}) {
  if (!prev && !next) return null

  return (
    <nav className="mt-12 flex max-w-3xl items-center justify-between border-t border-border/40 pt-6">
      {prev ? (
        <Link
          href={slugToHref(prev.slug)}
          className="group flex items-center gap-1.5 text-sm text-muted-foreground no-underline transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
          <span>
            <span className="block text-xs text-muted-foreground/70">Previous</span>
            {prev.title}
          </span>
        </Link>
      ) : (
        <span />
      )}
      {next ? (
        <Link
          href={slugToHref(next.slug)}
          className="group flex items-center gap-1.5 text-right text-sm text-muted-foreground no-underline transition-colors hover:text-foreground"
        >
          <span>
            <span className="block text-xs text-muted-foreground/70">Next</span>
            {next.title}
          </span>
          <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      ) : (
        <span />
      )}
    </nav>
  )
}
