"use client";

import { useEffect } from "react";
import { X, Download } from "lucide-react";

type ImageLightboxProps = {
  src: string;
  alt: string;
  onClose: () => void;
  onDownload?: () => void;
};

export function ImageLightbox({ src, alt, onClose, onDownload }: ImageLightboxProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Controls */}
      <div className="absolute top-4 right-4 flex items-center gap-2">
        {onDownload && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDownload(); }}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.1] text-hub-text-secondary backdrop-blur-sm transition hover:bg-white/[0.18] hover:text-hub-text"
            title="Download"
          >
            <Download className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.1] text-hub-text-secondary backdrop-blur-sm transition hover:bg-white/[0.18] hover:text-hub-text"
          title="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Image — click on image doesn't close */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] max-w-[90vw] rounded-xl object-contain shadow-2xl"
        style={{ animation: "lightbox-in 0.15s ease-out" }}
      />

      <style>{`
        @keyframes lightbox-in {
          from { opacity: 0; transform: scale(0.94); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
