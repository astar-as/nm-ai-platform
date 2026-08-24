"use client"

import { useAuth } from "@/app/_providers/auth-provider"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { Loader2 } from "lucide-react"

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isAuthenticated } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!isLoading && (!isAuthenticated || !user?.is_admin)) {
      router.replace("/")
    }
  }, [isLoading, isAuthenticated, user, router])

  if (isLoading || !user?.is_admin) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return <>{children}</>
}
