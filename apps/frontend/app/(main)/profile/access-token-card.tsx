"use client"

import { useEffect, useState } from "react"
import { Copy, KeyRound, Loader2, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { API_BASE } from "@/lib/api"

interface TokenSummary {
  id: string
  name: string
  token_hint: string
  expires_at: string
  last_used_at: string | null
}

export function AccessTokenCard() {
  const [tokens, setTokens] = useState<TokenSummary[]>([])
  const [name, setName] = useState("MCP client")
  const [createdToken, setCreatedToken] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function loadTokens() {
    const response = await fetch(`${API_BASE}/auth/tokens`, { credentials: "include" })
    if (response.ok) setTokens(await response.json())
  }

  useEffect(() => {
    loadTokens().catch(() => {})
  }, [])

  async function createToken() {
    setBusy(true)
    try {
      const response = await fetch(`${API_BASE}/auth/tokens`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, expires_in_days: 30 }),
      })
      if (!response.ok) throw new Error("Access token could not be created")
      const result = await response.json()
      setCreatedToken(result.token)
      await loadTokens()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Access token could not be created")
    } finally {
      setBusy(false)
    }
  }

  async function revokeToken(id: string) {
    const response = await fetch(`${API_BASE}/auth/tokens/${id}`, {
      method: "DELETE",
      credentials: "include",
    })
    if (!response.ok) {
      toast.error("Access token could not be revoked")
      return
    }
    setTokens((current) => current.filter((token) => token.id !== id))
  }

  async function copyToken() {
    if (!createdToken) return
    await navigator.clipboard.writeText(createdToken)
    toast.success("Access token copied")
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="h-4 w-4" /> Personal access tokens
        </CardTitle>
        <CardDescription>Use a short-lived token for your own MCP client. Tokens inherit your account access.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {createdToken && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 space-y-2">
            <p className="text-xs text-muted-foreground">Copy this token now. It will not be shown again.</p>
            <div className="flex gap-2">
              <Input readOnly value={createdToken} className="font-mono text-xs" />
              <Button variant="outline" size="icon" onClick={copyToken} aria-label="Copy access token">
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <Input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
          <Button onClick={createToken} disabled={busy || !name.trim()}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Create
          </Button>
        </div>

        {tokens.map((token) => (
          <div key={token.id} className="flex items-center justify-between gap-3 border-t pt-3">
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{token.name}</p>
              <p className="text-xs text-muted-foreground font-mono">{token.token_hint}</p>
              <p className="text-xs text-muted-foreground">
                Expires {new Date(token.expires_at).toLocaleDateString()}
                {token.last_used_at ? ` · Last used ${new Date(token.last_used_at).toLocaleDateString()}` : ""}
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => revokeToken(token.id)} aria-label={`Revoke ${token.name}`}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
