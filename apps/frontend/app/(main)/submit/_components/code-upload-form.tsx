"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { Loader2, Upload, FileArchive, X, CheckCircle2, AlertCircle, ShieldAlert } from "lucide-react"
import { toast } from "sonner"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import { API_BASE } from "@/lib/api"

export interface Quota {
  remaining: number
  max_per_day: number
  infra_used: number
  infra_freebies: number
  is_banned?: boolean
  ban_reason?: string | null
}

const MAX_UPLOAD_MB = 420

interface CodeUploadFormProps {
  taskId: string
  maxUploadMb?: number
  quota?: Quota | null
  onSubmitted?: () => void
}

type UploadStatus = "idle" | "uploading" | "polling" | "completed" | "failed"

const STATUS_STYLES: Record<string, string> = {
  queued: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  processing: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  completed: "bg-green-500/20 text-green-400 border-green-500/30",
  failed: "bg-red-500/20 text-red-400 border-red-500/30",
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function CodeUploadForm({ taskId, maxUploadMb, quota, onSubmitted }: CodeUploadFormProps) {
  const maxBytes = (maxUploadMb || MAX_UPLOAD_MB) * 1024 * 1024
  const maxMb = maxUploadMb || MAX_UPLOAD_MB

  const [file, setFile] = useState<File | null>(null)
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle")
  const [uploadProgress, setUploadProgress] = useState(0)
  const [submissionStatus, setSubmissionStatus] = useState<string | null>(null)
  const [submissionScore, setSubmissionScore] = useState<number | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const xhrRef = useRef<XMLHttpRequest | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollStartRef = useRef<number>(0)
  const submissionIdRef = useRef<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (xhrRef.current) xhrRef.current.abort()
      if (pollRef.current) clearInterval(pollRef.current)
      if (abortRef.current) abortRef.current.abort()
      if (submissionIdRef.current) {
        fetch(`${API_BASE}/tasks/${taskId}/submissions/${submissionIdRef.current}/cancel`, {
          method: "POST",
          credentials: "include",
        }).catch((err) => {
          console.error("Failed to cancel submission on unmount:", err)
        })
      }
    }
  }, [taskId])

  function validateFile(f: File): string | null {
    if (!f.name.endsWith(".zip")) return "Only .zip files are accepted"
    if (f.size > maxBytes) return `File too large. Maximum size is ${maxMb}MB`
    if (f.size === 0) return "File is empty"
    return null
  }

  function handleFileSelect(f: File) {
    const error = validateFile(f)
    if (error) {
      toast.error(error)
      return
    }
    setFile(f)
    setUploadStatus("idle")
    setUploadProgress(0)
    submissionIdRef.current = null
    setSubmissionStatus(null)
    setSubmissionScore(null)
    setErrorMessage(null)
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) handleFileSelect(f)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files?.[0]
    if (f) handleFileSelect(f)
  }

  function clearFile() {
    setFile(null)
    setUploadStatus("idle")
    setUploadProgress(0)
    submissionIdRef.current = null
    setSubmissionStatus(null)
    setSubmissionScore(null)
    setErrorMessage(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const pollSubmission = useCallback(
    (id: string) => {
      setUploadStatus("polling")
      setSubmissionStatus("queued")
      pollStartRef.current = Date.now()

      pollRef.current = setInterval(async () => {
        if (Date.now() - pollStartRef.current > 600_000) {
          if (pollRef.current) clearInterval(pollRef.current)
          setUploadStatus("failed")
          setErrorMessage("Evaluation is taking longer than expected. Check submission history for updates.")
          onSubmitted?.()
          return
        }
        try {
          const res = await fetch(`${API_BASE}/submissions/${id}`, {
            credentials: "include",
          })
          if (!res.ok) return

          const data = await res.json()
          setSubmissionStatus(data.status)

          if (data.status === "completed") {
            setUploadStatus("completed")
            setSubmissionScore(data.score)
            if (pollRef.current) clearInterval(pollRef.current)
            onSubmitted?.()
          } else if (data.status === "failed") {
            setUploadStatus("failed")
            setErrorMessage(data.error_message || "Evaluation failed")
            if (pollRef.current) clearInterval(pollRef.current)
            onSubmitted?.()
          }
        } catch {}
      }, 3000)
    },
    [onSubmitted]
  )

  function cancelSubmission() {
    const sid = submissionIdRef.current
    if (sid) {
      fetch(`${API_BASE}/tasks/${taskId}/submissions/${sid}/cancel`, {
        method: "POST",
        credentials: "include",
      }).catch((err) => {
        console.error("Failed to cancel submission:", err)
      })
    }
  }

  async function handleUpload() {
    if (!file || uploadStatus !== "idle") return

    setUploadStatus("uploading")
    setUploadProgress(0)
    setErrorMessage(null)

    try {
      const initRes = await fetch(`${API_BASE}/tasks/${taskId}/submissions/init-upload`, {
        method: "POST",
        credentials: "include",
      })

      if (!initRes.ok) {
        const err = await initRes.json().catch(() => null)
        const msg = err?.detail || `Failed to initialize upload (${initRes.status})`
        setUploadStatus("failed")
        setErrorMessage(msg)
        toast.error(msg)
        onSubmitted?.()
        return
      }

      const { id, upload_url, method, max_upload_bytes: serverMaxBytes } = await initRes.json()
      submissionIdRef.current = id

      if (method === "direct" || !upload_url) {
        const formData = new FormData()
        formData.append("file", file)
        const directRes = await fetch(
          `${API_BASE}/tasks/${taskId}/submissions/upload`,
          { method: "POST", credentials: "include", body: formData }
        )
        if (directRes.ok) {
          const data = await directRes.json()
          submissionIdRef.current = null
          toast.success("Upload complete. Evaluating...")
          pollSubmission(data.id)
        } else {
          const err = await directRes.json().catch(() => null)
          setUploadStatus("failed")
          setErrorMessage(err?.detail || "Upload failed")
          toast.error(err?.detail || "Upload failed")
          cancelSubmission()
        }
        return
      }

      const xhr = new XMLHttpRequest()
      xhrRef.current = xhr

      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          setUploadProgress(Math.round((e.loaded / e.total) * 100))
        }
      })

      xhr.addEventListener("load", async () => {
        if (xhr.status === 200) {
          setUploadProgress(100)
          try {
            const controller = new AbortController()
            abortRef.current = controller
            const finalRes = await fetch(
              `${API_BASE}/tasks/${taskId}/submissions/${id}/finalize`,
              { method: "POST", credentials: "include", signal: controller.signal }
            )
            if (!mountedRef.current) return
            if (finalRes.ok) {
              submissionIdRef.current = null
              toast.success("Upload complete. Evaluating...")
              pollSubmission(id)
            } else {
              const err = await finalRes.json().catch(() => null)
              setUploadStatus("failed")
              setErrorMessage(err?.detail || "Failed to finalize submission")
              toast.error(err?.detail || "Failed to finalize submission")
              cancelSubmission()
            }
          } catch (e) {
            if (e instanceof DOMException && e.name === "AbortError") return
            if (!mountedRef.current) return
            setUploadStatus("failed")
            setErrorMessage("Failed to finalize submission")
            cancelSubmission()
          }
        } else {
          if (!mountedRef.current) return
          setUploadStatus("failed")
          setErrorMessage(`Upload to storage failed (${xhr.status})`)
          toast.error("Upload to storage failed")
          cancelSubmission()
        }
      })

      xhr.addEventListener("error", () => {
        setUploadStatus("failed")
        setErrorMessage("Network error during upload")
        toast.error("Network error during upload")
        cancelSubmission()
      })

      xhr.addEventListener("abort", () => {
        setUploadStatus("idle")
        setUploadProgress(0)
      })

      xhr.open("PUT", upload_url)
      xhr.setRequestHeader("Content-Type", "application/zip")
      xhr.setRequestHeader("x-goog-content-length-range", `1,${serverMaxBytes}`)
      xhr.send(file)
    } catch {
      setUploadStatus("failed")
      setErrorMessage("Failed to start upload")
      toast.error("Failed to start upload")
    }
  }

  function handleCancel() {
    if (xhrRef.current) {
      xhrRef.current.abort()
      xhrRef.current = null
    }
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
    cancelSubmission()
    submissionIdRef.current = null
  }

  const isUploading = uploadStatus === "uploading"
  const isPolling = uploadStatus === "polling"
  const isDone = uploadStatus === "completed" || uploadStatus === "failed"

  if (quota?.is_banned) {
    return (
      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-3 p-4 rounded-lg bg-red-500/5 border border-red-500/20">
          <ShieldAlert className="w-5 h-5 text-red-400 shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-400">Submissions Disabled</p>
            {quota.ban_reason && (
              <p className="text-xs text-red-400/70 mt-1">{quota.ban_reason}</p>
            )}
          </div>
        </div>
      </Card>
    )
  }

  const quotaExhausted = quota ? quota.remaining <= 0 : false

  return (
    <Card className="p-6 space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Upload Code</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Upload a .zip file containing your model code. Max {maxMb}MB.
        </p>
      </div>

      {quota && (
        <div className="space-y-1">
          <p className={cn(
            "text-sm font-medium",
            quota.remaining <= 0 ? "text-yellow-400" : "text-muted-foreground"
          )}>
            {quota.remaining} of {quota.max_per_day} submissions remaining today
          </p>
          {quota.infra_used > 0 && (
            <p className="text-xs text-muted-foreground/70">
              {Math.max(0, quota.infra_freebies - quota.infra_used)} of {quota.infra_freebies} failure freebies remaining
              {quota.infra_used > quota.infra_freebies && (
                <span className="text-yellow-400 ml-1">(excess failures reducing submissions)</span>
              )}
            </p>
          )}
          {quotaExhausted && (
            <p className="text-xs text-yellow-400">
              Daily submission limit reached. Resets at midnight UTC.
            </p>
          )}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".zip"
        onChange={handleInputChange}
        className="hidden"
      />

      {!file ? (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={cn(
            "w-full border-2 border-dashed rounded-xl p-8 transition-colors text-center",
            dragOver
              ? "border-primary/50 bg-primary/5"
              : "border-white/10 hover:border-white/20 hover:bg-white/5"
          )}
        >
          <Upload className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm font-medium">Drop your .zip file here or click to browse</p>
          <p className="text-xs text-muted-foreground mt-1">
            Maximum file size: {maxMb}MB
          </p>
        </button>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-white/10">
            <FileArchive className="w-5 h-5 text-muted-foreground shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{file.name}</p>
              <p className="text-xs text-muted-foreground">{formatSize(file.size)}</p>
            </div>
            {!isUploading && !isPolling && (
              <button
                onClick={clearFile}
                className="p-1 rounded hover:bg-white/10 transition-colors"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            )}
          </div>

          {isUploading && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Uploading...</span>
                <span className="font-mono">{uploadProgress}%</span>
              </div>
              <Progress value={uploadProgress} />
            </div>
          )}

          {isPolling && submissionStatus && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
              <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
              <span className="text-sm text-blue-400">
                Evaluating submission...
              </span>
              <Badge
                variant="outline"
                className={cn("ml-auto capitalize", STATUS_STYLES[submissionStatus])}
              >
                {submissionStatus}
              </Badge>
            </div>
          )}

          {uploadStatus === "completed" && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/5 border border-green-500/20">
              <CheckCircle2 className="w-4 h-4 text-green-400" />
              <span className="text-sm text-green-400">Evaluation complete</span>
              {submissionScore !== null && Number.isFinite(submissionScore) && (
                <span className="ml-auto font-mono font-medium text-green-400">
                  Score: {submissionScore.toFixed(4)}
                </span>
              )}
            </div>
          )}

          {uploadStatus === "failed" && errorMessage && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/5 border border-red-500/20">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span className="text-sm text-red-400">{errorMessage}</span>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-end">
        <div className="flex gap-2">
          {isUploading && (
            <Button variant="ghost" size="sm" onClick={handleCancel}>
              Cancel
            </Button>
          )}
          {!isUploading && !isPolling && !isDone && file && (
            <Button onClick={handleUpload} disabled={quotaExhausted}>
              <Upload className="w-4 h-4 mr-2" />
              Upload & Submit
            </Button>
          )}
        </div>
      </div>
    </Card>
  )
}
