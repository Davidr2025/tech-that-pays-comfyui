"use client";

import { useRef, useState } from "react";

interface UploadWidgetProps {
  eventSlug: string;
  accentClassName: string;
  onUploaded?: () => void;
}

type UploadState = { fileName: string; progress: "uploading" | "done" | "error" };

export function UploadWidget({ eventSlug, accentClassName, onUploaded }: UploadWidgetProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<UploadState[]>([]);

  async function uploadFile(file: File) {
    setUploads((prev) => [...prev, { fileName: file.name, progress: "uploading" }]);

    try {
      const res = await fetch(`/api/events/${eventSlug}/upload-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: file.type }),
      });
      if (!res.ok) throw new Error("Could not start upload");
      const { mediaId, uploadUrl } = await res.json();

      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!putRes.ok) throw new Error("Upload failed");

      await fetch(`/api/events/${eventSlug}/media/${mediaId}/confirm`, { method: "POST" });

      setUploads((prev) =>
        prev.map((u) => (u.fileName === file.name ? { ...u, progress: "done" } : u)),
      );
      onUploaded?.();
    } catch {
      setUploads((prev) =>
        prev.map((u) => (u.fileName === file.name ? { ...u, progress: "error" } : u)),
      );
    }
  }

  function handleFiles(files: FileList | null) {
    if (!files) return;
    Array.from(files).forEach((file) => void uploadFile(file));
  }

  return (
    <div className="w-full">
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        capture="environment"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={`w-full rounded-xl px-6 py-4 text-lg font-semibold shadow-sm transition ${accentClassName}`}
      >
        📸 Add your photos &amp; videos
      </button>

      {uploads.length > 0 && (
        <ul className="mt-4 space-y-1 text-sm">
          {uploads.map((u, i) => (
            <li key={`${u.fileName}-${i}`} className="flex items-center justify-between">
              <span className="truncate">{u.fileName}</span>
              <span>
                {u.progress === "uploading" && "Uploading…"}
                {u.progress === "done" && "✓ Uploaded"}
                {u.progress === "error" && "⚠ Failed"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
