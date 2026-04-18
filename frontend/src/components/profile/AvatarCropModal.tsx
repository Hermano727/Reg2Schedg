"use client";

import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, ZoomIn } from "lucide-react";

const SIZE = 256; // crop output and preview dimensions (px)

type Pan = { x: number; y: number };

type Props = {
  file: File;
  onConfirm: (blob: Blob) => void;
  onCancel: () => void;
};

export function AvatarCropModal({ file, onConfirm, onCancel }: Props) {
  const imgEl = useRef<HTMLImageElement | null>(null);
  const objUrl = useRef("");
  const [ready, setReady] = useState(false);
  const [minZoom, setMinZoom] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Pan>({ x: 0, y: 0 });
  const dragging = useRef(false);
  const lastPt = useRef({ x: 0, y: 0 });

  useEffect(() => {
    objUrl.current = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      imgEl.current = img;
      const min = Math.max(SIZE / img.naturalWidth, SIZE / img.naturalHeight);
      setMinZoom(min);
      setZoom(min);
      setPan({ x: 0, y: 0 });
      setReady(true);
    };
    img.src = objUrl.current;
    return () => URL.revokeObjectURL(objUrl.current);
  }, [file]);

  function clampPan(x: number, y: number, z: number): Pan {
    const img = imgEl.current;
    if (!img) return { x: 0, y: 0 };
    const maxX = Math.max(0, (img.naturalWidth * z - SIZE) / 2);
    const maxY = Math.max(0, (img.naturalHeight * z - SIZE) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, x)),
      y: Math.min(maxY, Math.max(-maxY, y)),
    };
  }

  function applyZoom(newZoom: number) {
    setZoom(newZoom);
    setPan((prev) => clampPan(prev.x, prev.y, newZoom));
  }

  // ── Mouse drag ────────────────────────────────────────────────────────────
  function onMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    dragging.current = true;
    lastPt.current = { x: e.clientX, y: e.clientY };
  }
  function onMouseMove(e: React.MouseEvent) {
    if (!dragging.current) return;
    const dx = e.clientX - lastPt.current.x;
    const dy = e.clientY - lastPt.current.y;
    lastPt.current = { x: e.clientX, y: e.clientY };
    setPan((prev) => clampPan(prev.x + dx, prev.y + dy, zoom));
  }
  function onMouseUp() {
    dragging.current = false;
  }

  // ── Touch drag ────────────────────────────────────────────────────────────
  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length !== 1) return;
    dragging.current = true;
    lastPt.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }
  function onTouchMove(e: React.TouchEvent) {
    if (!dragging.current || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - lastPt.current.x;
    const dy = e.touches[0].clientY - lastPt.current.y;
    lastPt.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    setPan((prev) => clampPan(prev.x + dx, prev.y + dy, zoom));
  }

  // ── Confirm: draw to canvas and export ───────────────────────────────────
  function handleConfirm() {
    const img = imgEl.current;
    if (!img) return;
    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Map container-space crop [0,0,SIZE,SIZE] → image-space source rect
    const imgLeft = (SIZE - img.naturalWidth * zoom) / 2 + pan.x;
    const imgTop = (SIZE - img.naturalHeight * zoom) / 2 + pan.y;
    const srcX = -imgLeft / zoom;
    const srcY = -imgTop / zoom;
    const srcW = SIZE / zoom;
    const srcH = SIZE / zoom;

    ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, SIZE, SIZE);
    canvas.toBlob(
      (blob) => {
        if (blob) onConfirm(blob);
      },
      "image/jpeg",
      0.92,
    );
  }

  // Image top-left position in the preview container
  const img = imgEl.current;
  const imgLeft = img ? (SIZE - img.naturalWidth * zoom) / 2 + pan.x : 0;
  const imgTop = img ? (SIZE - img.naturalHeight * zoom) / 2 + pan.y : 0;
  const imgW = img ? img.naturalWidth * zoom : SIZE;
  const imgH = img ? img.naturalHeight * zoom : SIZE;

  return (
    <Dialog.Root open onOpenChange={(v) => { if (!v) onCancel(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" />
        <Dialog.Content className="glass-panel fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-white/[0.1] p-6 shadow-2xl">
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="text-sm font-semibold text-hub-text">
              Adjust photo
            </Dialog.Title>
            <Dialog.Close
              onClick={onCancel}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-hub-text-muted transition hover:text-hub-text"
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          {/* Circular crop preview */}
          <div className="mx-auto flex flex-col items-center gap-4">
            <div
              className="relative overflow-hidden rounded-full border-2 border-hub-cyan/30 shadow-[0_0_0_4px_rgba(0,212,255,0.06)]"
              style={{ width: SIZE, height: SIZE, cursor: "grab" }}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseUp}
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={() => { dragging.current = false; }}
            >
              {ready && img ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={objUrl.current}
                  alt="crop preview"
                  draggable={false}
                  style={{
                    position: "absolute",
                    left: imgLeft,
                    top: imgTop,
                    width: imgW,
                    height: imgH,
                    userSelect: "none",
                    touchAction: "none",
                  }}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <span className="h-6 w-6 animate-spin rounded-full border-2 border-hub-cyan/30 border-t-hub-cyan" />
                </div>
              )}
            </div>

            <p className="text-center text-xs text-hub-text-muted">
              Drag to reposition · scroll slider to zoom
            </p>

            {/* Zoom slider */}
            <div className="flex w-full items-center gap-3">
              <ZoomIn className="h-4 w-4 shrink-0 text-hub-text-muted" />
              <input
                type="range"
                min={minZoom}
                max={minZoom * 3}
                step={0.01}
                value={zoom}
                onChange={(e) => applyZoom(parseFloat(e.target.value))}
                className="w-full accent-hub-cyan"
                disabled={!ready}
              />
            </div>
          </div>

          <div className="mt-5 flex justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="h-9 rounded-lg border border-white/[0.08] px-4 text-sm text-hub-text-secondary transition hover:border-white/[0.14] hover:text-hub-text"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!ready}
              className="h-9 rounded-lg bg-hub-cyan px-4 text-sm font-medium text-hub-bg transition hover:brightness-110 disabled:opacity-50"
            >
              Save photo
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
