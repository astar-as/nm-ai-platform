"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import type { DocNavSection } from "@/lib/docs-nav"

export function DocsSidebar({ nav }: { nav: DocNavSection[] }) {
  const pathname = usePathname()
  const sections = nav

  return (
    <nav className="space-y-5">
      {sections.map((section) => (
        <div key={section.title}>
          <h4 className="mb-1.5 px-3 text-sm font-semibold text-foreground">
            {section.title}
          </h4>
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const href =
                item.slug === "getting-started"
                  ? "/docs"
                  : `/docs/${item.slug}`
              const isActive = pathname === href

              return (
                <li key={item.slug}>
                  <Link
                    href={href}
                    className={cn(
                      "block border-l-2 px-3 py-1.5 text-sm no-underline transition-colors",
                      isActive
                        ? "border-primary bg-primary/5 font-medium text-primary"
                        : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
                    )}
                  >
                    {item.title}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}
