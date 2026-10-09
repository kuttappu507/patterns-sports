"use client"

import { useRef, useState } from "react"
import { Upload, X, FileText, ImageIcon, Loader2 } from "lucide-react"
import { uploadMedia, mediaUrl, type UploadFolder } from "@/lib/psams/api"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface MediaUploadProps {
  folder: UploadFolder
  value?: string | null
  onChange: (path: string | null) => void
  label?: string
  hint?: string
  className?: string
  previewShape?: "square" | "portrait" | "wide"
}

/** Local-disk media upload with instant preview. Stores relative paths only. */
export function MediaUpload({
  folder,
  value,
  onChange,
  label,
  hint,
  className,
  previewShape = "square",
}: MediaUploadProps) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const isImage = (p: string) => /\.(png|jpe?g|webp)$/i.test(p)

  async function handleFile(file: File) {
    setError(null)
    setUploading(true)
    try {
      const { path } = await uploadMedia(file, folder)
      onChange(path)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed")
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      {label && <div className="text-xs font-medium text-muted-foreground">{label}</div>}
      {value ? (
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "relative overflow-hidden rounded-lg border bg-muted/40 flex items-center justify-center",
              previewShape === "portrait" && "w-24 h-32",
              previewShape === "square" && "w-20 h-20",
              previewShape === "wide" && "w-full h-20"
            )}
          >
            {isImage(value) ? (
               
              <img
                src={mediaUrl(value)}
                alt="attachment preview"
                className={previewShape === "wide" ? "h-full w-full object-contain" : "h-full w-full object-cover"}
              />
            ) : (
              <div className="flex flex-col items-center gap-1 text-muted-foreground">
                <FileText className="h-6 w-6" />
                <span className="text-[15.5px]">PDF</span>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => inputRef.current?.click()}
            >
              Replace
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-destructive hover:text-destructive"
              onClick={() => onChange(null)}
            >
              <X className="h-3 w-3 mr-1" /> Remove
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-input bg-muted/50 px-3 py-3 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent/50 hover:text-accent-foreground",
            previewShape === "portrait" && "py-8",
            uploading && "opacity-60"
          )}
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isImageTarget(folder) ? (
            <ImageIcon className="h-4 w-4" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          {uploading ? "Uploading…" : hint || "Click to upload"}
        </button>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={folder === "photos" ? "image/png,image/jpeg,image/webp" : "application/pdf,image/png,image/jpeg"}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleFile(f)
          e.target.value = ""
        }}
      />
    </div>
  )
}

function isImageTarget(folder: UploadFolder) {
  return folder === "photos"
}
