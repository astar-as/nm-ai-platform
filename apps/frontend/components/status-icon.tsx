import { CheckCircle2, XCircle, Clock, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

export function StatusIcon({ status, size = "sm" }: { status: string; size?: "sm" | "md" }) {
  const sizeClass = size === "md" ? "w-6 h-6" : "w-4 h-4"
  switch (status) {
    case "completed":
      return <CheckCircle2 className={cn(sizeClass, "text-green-500")} />
    case "failed":
    case "timeout":
      return <XCircle className={cn(sizeClass, "text-red-500")} />
    case "processing":
      return <Loader2 className={cn(sizeClass, "text-blue-500 animate-spin")} />
    default:
      return <Clock className={cn(sizeClass, "text-muted-foreground")} />
  }
}
