// Web Speech access, shared by every feature that listens (capture + Partner).
// lib.dom has no typings for the webkit-prefixed constructor, and features are
// never allowed to import each other, so the one definition lives here.
export interface SpeechAlternativeLike {
  transcript: string;
}
export interface SpeechResultLike {
  0: SpeechAlternativeLike;
  isFinal: boolean;
}
export interface SpeechEventLike {
  results: ArrayLike<SpeechResultLike>;
  resultIndex: number;
}
export interface SpeechErrorLike {
  error?: string;
}
export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: SpeechErrorLike) => void) | null;
  start: () => void;
  stop: () => void;
}
export type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

export function speechCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}
