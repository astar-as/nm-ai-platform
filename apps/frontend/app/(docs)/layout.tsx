export const dynamic = "force-dynamic"

import Link from "next/link"
import { ThemeLogo } from "@/components/theme-logo"

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border/40 bg-background/95 backdrop-blur-sm">
        <div className="flex h-14 items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <Link href="/" className="no-underline">
              <ThemeLogo width={70} height={24} priority />
            </Link>
            <span className="text-border">/</span>
            <Link
              href="/docs"
              className="text-sm font-medium no-underline text-foreground"
            >
              Docs
            </Link>
          </div>
          <Link
            href="/dashboard"
            className="text-sm text-muted-foreground no-underline hover:text-foreground transition-colors"
          >
            Back to app
          </Link>
        </div>
      </header>
      {children}
    </div>
  )
}
