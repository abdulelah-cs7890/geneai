"use client";

import { useCallback, useRef, useState } from "react";

interface DropzoneProps {
  label: string;
  accept: string;
  kind: "video" | "image";
  file: File | null;
  onFile: (file: File | null) => void;
}

/** Reusable drag-and-drop file picker with an inline preview. */
export function Dropzone({ label, accept, kind, file, onFile }: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  const setSelected = useCallback(
    (f: File | null) => {
      setPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return f ? URL.createObjectURL(f) : null;
      });
      onFile(f);
    },
    [onFile],
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const f = e.dataTransfer.files?.[0];
        if (f) setSelected(f);
      }}
      onClick={() => inputRef.current?.click()}
      className={`group relative flex aspect-[9/16] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed transition ${
        dragging
          ? "border-fuchsia-400 bg-fuchsia-500/10"
          : "border-white/15 bg-white/[0.03] hover:border-white/30 hover:bg-white/[0.06]"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => setSelected(e.target.files?.[0] ?? null)}
      />

      {preview && kind === "video" && (
        <video src={preview} muted loop autoPlay playsInline className="absolute inset-0 h-full w-full object-cover" />
      )}
      {preview && kind === "image" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt={label} className="absolute inset-0 h-full w-full object-cover" />
      )}

      <div
        className={`relative z-10 flex flex-col items-center gap-1 px-4 text-center ${
          preview ? "bg-black/45 rounded-xl py-2 backdrop-blur-sm" : ""
        }`}
      >
        <span className="text-2xl">{kind === "video" ? "🎬" : "🧑‍🎤"}</span>
        <span className="text-sm font-medium text-white">{file ? file.name : label}</span>
        <span className="text-xs text-white/50">
          {file ? `${(file.size / 1024 / 1024).toFixed(1)} MB — click to replace` : "Drag & drop or click"}
        </span>
      </div>
    </div>
  );
}
