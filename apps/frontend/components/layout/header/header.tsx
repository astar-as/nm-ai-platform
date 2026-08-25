"use client"

import Link from "next/link"
import { Nav } from "./nav"
import { MobileNav } from "./mobile-nav"
import { ThemeLogo } from "@/components/theme-logo"
import { UserMenu } from "./user-menu"
import { useAuth } from "@/app/_providers/auth-provider"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/theme-toggle"

export function Header() {
  const { isAuthenticated, isLoading } = useAuth()

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-xl print-hidden">
      <div className="flex h-16 items-center justify-between px-6 w-full">
        <div className="flex items-center gap-8">
          <Link href={isAuthenticated ? "/dashboard" : "/"} className="no-underline">
            <ThemeLogo width={90} height={30} priority />
          </Link>
          <Nav />
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          {isLoading ? (
            <div className="h-8 w-20 bg-muted rounded animate-pulse" />
          ) : isAuthenticated ? (
            <UserMenu />
          ) : (
            <Button asChild size="sm">
              <Link href="/" className="no-underline">
                Sign in
              </Link>
            </Button>
          )}
          <MobileNav />
        </div>
      </div>
    </header>
  )
}
