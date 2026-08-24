"use client"

import { useState, useEffect, useCallback } from "react"
import { Loader2, Download, RefreshCw } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { API_BASE } from "@/lib/api"

const REFRESH_INTERVAL_MS = 50 * 60 * 1000

interface DownloadFile {
  name: string
  description: string
  size?: string
  url: string
}

export function TrainingDataSection({ taskId }: { taskId: string }) {
  const [files, setFiles] = useState<DownloadFile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchFiles = useCallback(async () => {
    try {
      setError(null)
      const res = await fetch(`${API_BASE}/tasks/${taskId}/download-data`, { credentials: "include" })
      if (res.ok) {
        const data = await res.json()
        setFiles(data.files)
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data.detail || `Error ${res.status}`)
      }
    } catch {
      setError("Failed to load training data")
    } finally {
      setLoading(false)
    }
  }, [taskId])

  useEffect(() => {
    fetchFiles()
    const interval = setInterval(fetchFiles, REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [fetchFiles])

  if (loading) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading training data...
        </div>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="p-4 flex items-center justify-between">
        <p className="text-sm text-red-400">{error}</p>
        <Button variant="ghost" size="sm" onClick={fetchFiles}>
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
          Retry
        </Button>
      </Card>
    )
  }

  if (files.length === 0) return null

  return (
    <Card className="p-4 space-y-3">
      <h3 className="text-sm font-semibold">Training Data</h3>
      <div className="space-y-2">
        {files.map((file) => (
          <a
            key={file.name}
            href={file.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between p-3 rounded-md border hover:bg-muted/50 transition-colors no-underline"
          >
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-foreground">{file.name}</p>
              <p className="text-xs text-muted-foreground">
                {file.description}
                {file.size && <span className="ml-2 text-muted-foreground/70">({file.size})</span>}
              </p>
            </div>
            <Download className="w-4 h-4 text-muted-foreground shrink-0 ml-3" />
          </a>
        ))}
      </div>
    </Card>
  )
}
