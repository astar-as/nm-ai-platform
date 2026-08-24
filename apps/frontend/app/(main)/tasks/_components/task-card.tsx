import Link from "next/link"
import Image from "next/image"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ArrowRight, Play, Clock, Timer } from "lucide-react"
import { formatDistanceToNow, isBefore, isAfter } from "date-fns"

interface TaskCardProps {
  slug: string
  label: string
  description: string
  metric: string
  logo?: string
  href?: string
  action?: string
  opensAt?: string | null
  closesAt?: string | null
  maxResponseTimeMs?: number | null
}

function getTaskStatus(opensAt?: string | null, closesAt?: string | null): {
  label: string
  variant: "default" | "secondary" | "destructive" | "outline"
  detail?: string
} {
  const now = new Date()

  if (opensAt && isAfter(new Date(opensAt), now)) {
    return {
      label: "Upcoming",
      variant: "secondary",
      detail: `Opens ${formatDistanceToNow(new Date(opensAt), { addSuffix: true })}`,
    }
  }

  if (closesAt && isBefore(new Date(closesAt), now)) {
    return {
      label: "Closed",
      variant: "destructive",
    }
  }

  if (closesAt) {
    return {
      label: "Open",
      variant: "default",
      detail: `Closes ${formatDistanceToNow(new Date(closesAt), { addSuffix: true })}`,
    }
  }

  return {
    label: "Open",
    variant: "default",
  }
}

export function TaskCard({ slug, label, description, metric, logo, href, action, opensAt, closesAt, maxResponseTimeMs }: TaskCardProps) {
  const linkHref = href || `/submit/${slug}`
  const buttonLabel = action || "Submit"
  const ButtonIcon = action === "Play" ? Play : ArrowRight
  const status = getTaskStatus(opensAt, closesAt)

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-start gap-3 flex-1">
            {logo && (
              <Image src={logo} alt="" width={28} height={28} className="mt-0.5 shrink-0" />
            )}
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold">{label}</h3>
                <Badge variant={status.variant}>{status.label}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">{description}</p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>
                  Metric: <span className="font-medium text-foreground">{metric}</span>
                </span>
                {maxResponseTimeMs && (
                  <span className="flex items-center gap-1">
                    <Timer className="h-3 w-3" />
                    {maxResponseTimeMs >= 1000
                      ? `${(maxResponseTimeMs / 1000).toFixed(maxResponseTimeMs % 1000 === 0 ? 0 : 1)}s`
                      : `${maxResponseTimeMs}ms`} response limit
                  </span>
                )}
                {status.detail && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {status.detail}
                  </span>
                )}
              </div>
            </div>
          </div>
          <Button variant="ghost" asChild>
            <Link href={linkHref} className="no-underline">
              {buttonLabel}
              <ButtonIcon className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
