"use client"

import { Suspense } from "react"
import { useAuth } from "@/app/_providers/auth-provider"
import { useRouter } from "next/navigation"
import { useEffect, useState, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Loader2, Check, Github } from "lucide-react"
import { toast } from "sonner"
import { API_BASE } from "@/lib/api"
import { AccessTokenCard } from "./access-token-card"

const OCCUPATIONS = [
  { value: "student", label: "Student" },
  { value: "employed", label: "Employed" },
  { value: "self_employed", label: "Self-employed" },
  { value: "unemployed", label: "Unemployed" },
  { value: "other", label: "Other" },
]

function useDebouncedSave() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  return (field: string, value: string) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE}/users/me`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [field]: value }),
        })
        if (!res.ok) throw new Error("Failed to update")
        toast.success("Profile updated")
      } catch {
        toast.error("Failed to update profile")
      }
    }, 800)
  }
}

export default function ProfilePage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    }>
      <ProfileContent />
    </Suspense>
  )
}

function ProfileContent() {
  const { user, isAuthenticated, isLoading } = useAuth()
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [occupation, setOccupation] = useState<string | undefined>(undefined)
  const [name, setName] = useState("")
  const [githubUsername, setGithubUsername] = useState("")
  const [linkedinUrl, setLinkedinUrl] = useState("")
  const [xUsername, setXUsername] = useState("")
  const debouncedSave = useDebouncedSave()

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/")
    }
  }, [isLoading, isAuthenticated, router])

  useEffect(() => {
    if (user?.occupation) setOccupation(user.occupation)
    if (user?.github_username) setGithubUsername(user.github_username)
    if (user?.linkedin_url) setLinkedinUrl(user.linkedin_url)
    if (user?.x_username) setXUsername(user.x_username)
  }, [user?.occupation, user?.github_username, user?.linkedin_url, user?.x_username])

  useEffect(() => {
    if (user?.name) {
      setName(user.name)
    }
  }, [user?.name])

  async function updateOccupation(value: string) {
    setOccupation(value)
    setSaving(true)
    try {
      const res = await fetch(`${API_BASE}/users/me`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ occupation: value }),
      })
      if (!res.ok) throw new Error("Failed to update")
      toast.success("Profile updated")
    } catch {
      toast.error("Failed to update profile")
    } finally {
      setSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!isAuthenticated || !user) {
    return null
  }

  const initials = (user.name || user.email.split("@")[0] || "U")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "U"

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              {user.avatar_url && <AvatarImage src={user.avatar_url} alt={user.name} />}
              <AvatarFallback className="bg-gradient-to-br from-electric-blue to-deep-navy text-white text-lg font-medium">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div>
              <CardTitle className="text-xl">{user.name || user.email.split("@")[0]}</CardTitle>
              <p className="text-sm text-muted-foreground">{user.email}</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3">
            <div className="flex items-center justify-between py-2 border-b border-border/50">
              <span className="text-sm text-muted-foreground">Display name</span>
              <div className="flex items-center gap-2">
                <Input
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value)
                    debouncedSave("name", e.target.value)
                  }}
                  maxLength={100}
                  placeholder="Display name"
                  className="w-[180px] h-8 text-sm"
                />
              </div>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-border/50">
              <span className="text-sm text-muted-foreground">Occupation</span>
              <div className="flex items-center gap-2">
                <Select value={occupation} onValueChange={updateOccupation}>
                  <SelectTrigger className="w-[180px] h-8 text-sm">
                    <SelectValue placeholder="Select occupation" />
                  </SelectTrigger>
                  <SelectContent>
                    {OCCUPATIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : occupation ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : null}
              </div>
            </div>
          </div>

          <div className="grid gap-3 pt-2">
            <p className="text-sm font-medium text-muted-foreground">Social links</p>
            <div className="flex items-center justify-between py-2 border-b border-border/50">
              <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                <Github className="h-3.5 w-3.5" />
                GitHub
              </span>
              <Input
                value={githubUsername}
                onChange={(e) => {
                  setGithubUsername(e.target.value)
                  debouncedSave("github_username", e.target.value)
                }}
                placeholder="username"
                className="w-[180px] h-8 text-sm"
              />
            </div>
            <div className="flex items-center justify-between py-2 border-b border-border/50">
              <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" /></svg>
                LinkedIn
              </span>
              <Input
                value={linkedinUrl}
                onChange={(e) => {
                  setLinkedinUrl(e.target.value)
                  debouncedSave("linkedin_url", e.target.value)
                }}
                placeholder="https://linkedin.com/in/..."
                className="w-[180px] h-8 text-sm"
              />
            </div>
            <div className="flex items-center justify-between py-2 border-b border-border/50">
              <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
                X
              </span>
              <Input
                value={xUsername}
                onChange={(e) => {
                  setXUsername(e.target.value)
                  debouncedSave("x_username", e.target.value)
                }}
                placeholder="username"
                className="w-[180px] h-8 text-sm"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <AccessTokenCard />

    </div>
  )
}
