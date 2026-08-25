import Link from "next/link"
import { appName } from "@/lib/branding"

const navLinks = [
  { label: "Rules", href: "/rules" },
  { label: "Docs", href: "/docs" },
  { label: "Privacy", href: "/privacy" },
]

export function Footer() {
  return (
    <footer className="border-t border-border/40 py-8 mt-auto w-full print-hidden">
      <div className="w-full px-4 sm:px-8 lg:px-16">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-between">
          <div className="text-center text-sm text-muted-foreground sm:text-left">
            <p>&copy; {new Date().getFullYear()} {appName}</p>
          </div>
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-muted-foreground hover:text-foreground transition-colors no-underline"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}
