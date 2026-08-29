"use client";
// Camera QR scanner — the browser's native BarcodeDetector over getUserMedia.
// No proprietary scanning service (spec §4): where the browser can't do it,
// the screen falls back to tap-to-add, which works everywhere.
// States: starting → scanning | denied (permission) | unsupported (no API/camera).
import { useEffect, useRef, useState } from "react";

export type ScannerState = "starting" | "scanning" | "denied" | "unsupported";

interface BarcodeDetectorLike {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>;
}
type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => BarcodeDetectorLike;

function detectorCtor(): BarcodeDetectorCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { BarcodeDetector?: BarcodeDetectorCtor };
  return w.BarcodeDetector ?? null;
}

export function useScanner(enabled: boolean, onCode: (raw: string) => void) {
  const [state, setState] = useState<ScannerState>("starting");
  const videoRef = useRef<HTMLVideoElement>(null);
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;

  useEffect(() => {
    if (!enabled) return;
    const Ctor = detectorCtor();
    if (!Ctor || !navigator.mediaDevices?.getUserMedia) {
      setState("unsupported");
      return;
    }
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      } catch (e) {
        if (!cancelled) setState(e instanceof DOMException && e.name === "NotAllowedError" ? "denied" : "unsupported");
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        /* autoplay quirks — the poll below still reads frames once playing */
      }
      setState("scanning");
      const detector = new Ctor({ formats: ["qr_code"] });
      timer = setInterval(() => {
        void (async () => {
          if (!videoRef.current || videoRef.current.readyState < 2) return;
          try {
            const codes = await detector.detect(videoRef.current);
            for (const c of codes) if (c.rawValue) onCodeRef.current(c.rawValue);
          } catch {
            /* a bad frame is just a skipped frame */
          }
        })();
      }, 350);
    })();

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [enabled]);

  return { state, videoRef };
}
