"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

const navItems = [
  { href: "/events", label: "Events" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/tasks", label: "Tasks" },
  { href: "/finals", label: "Finals" },
  { href: "/rules", label: "Rules" },
  { href: "/prizes", label: "Prizes" },
  { href: "/docs", label: "Docs" },
]

export function useNavItems() {
  return navItems
}

export function Nav() {
  const pathname = usePathname()
  const navItems = useNavItems()

  return (
    <nav className="hidden md:flex items-center gap-6">
      {navItems.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "text-sm font-medium no-underline transition-colors border-b-2 py-1",
              isActive
                ? "text-foreground border-primary"
                : "text-muted-foreground border-transparent hover:text-foreground hover:border-muted-foreground/50"
            )}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
