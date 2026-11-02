import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';

/** Timestamp helper kept at module scope so it stays out of render/purity checks. */
export function nowMs(): number {
  return Date.now();
}

const isNativePlatform = Capacitor.isNativePlatform();
const RECOGNITION_LANG = 'ar-SA';
const COOLDOWN_AFTER_AYAH_MS = 200;
const RESTART_DELAY_MS = 250;
const SILENCE_RETRY_DELAY_MS = 600;
const NATIVE_RESTART_DELAY_MS = 300;
const FATAL_ERRORS = ['not-allowed', 'service-not-allowed', 'audio-capture', 'network'];

interface SpeechResultAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechResultLike {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechResultAlternative;
}

interface SpeechResultEventLike {
  resultIndex: number;
  results: { length: number; [index: number]: SpeechResultLike };
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  lang: string;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onresult: ((event: SpeechResultEventLike) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

interface SpeechWindow {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | undefined {
  if (typeof window === 'undefined') return undefined;
  const speechWindow = window as unknown as SpeechWindow;
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
}

export interface SpeechEvaluation {
  completed: boolean;
  isFlawless: boolean;
}

export interface UseSpeechRecognitionOptions {
  /** Processes one final transcript alternative and returns completion info when finished. */
  onTranscript: (text: string, confidence?: number) => SpeechEvaluation | undefined;
  /** Invoked once the current ayah is complete. */
  onComplete: (isFlawless: boolean) => void;
  /** Reads the live matched-word index so alternatives can be compared synchronously. */
  getCurrentWordIndex: () => number;
  /** Whether recognition should keep listening / auto-restart. */
  shouldListen: () => boolean;
  /** Called when the microphone cannot be used, so the UI can offer a fallback. */
  onUnavailable?: () => void;
  lang?: string;
}

export interface UseSpeechRecognitionApi {
  isListening: boolean;
  isSupported: boolean;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  /** Ignores incoming results for a short period (used while moving to the next ayah). */
  setCooldown: (durationMs?: number) => void;
}

/**
 * Shared speech-recognition engine for the recitation screens.
 * Wraps the browser Web Speech API and the Capacitor native plugin behind one API,
 * including permissions, auto-restart, alternative picking and silence retries.
 */
export function useSpeechRecognition({
  onTranscript,
  onComplete,
  getCurrentWordIndex,
  shouldListen,
  onUnavailable,
  lang = RECOGNITION_LANG,
}: UseSpeechRecognitionOptions): UseSpeechRecognitionApi {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(() => !!getSpeechRecognitionConstructor());

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const enabledRef = useRef(false);
  const requestIdRef = useRef(0);
  const nativeActiveRef = useRef(false);
  const cooldownUntilRef = useRef(0);

  const onTranscriptRef = useRef(onTranscript);
  const onCompleteRef = useRef(onComplete);
  const getCurrentWordIndexRef = useRef(getCurrentWordIndex);
  const shouldListenRef = useRef(shouldListen);
  const onUnavailableRef = useRef(onUnavailable);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
    onCompleteRef.current = onComplete;
    getCurrentWordIndexRef.current = getCurrentWordIndex;
    shouldListenRef.current = shouldListen;
    onUnavailableRef.current = onUnavailable;
  });

  const markUnavailable = useCallback(() => {
    enabledRef.current = false;
    setIsListening(false);
    onUnavailableRef.current?.();
  }, []);

  // ─────────────── Native loop ───────────────
  const listenWithNativeRecognition = useCallback(async () => {
    if (!nativeActiveRef.current) return;

    try {
      const { matches } = await SpeechRecognition.start({
        language: lang,
        maxResults: 3,
        partialResults: false,
        popup: false,
      });
      if (!nativeActiveRef.current) return;

      if (nowMs() >= cooldownUntilRef.current) {
        for (const raw of (matches ?? []).slice(0, 3)) {
          const text = raw?.trim();
          if (!text) continue;
          const beforeIdx = getCurrentWordIndexRef.current();
          const nextState = onTranscriptRef.current(text);
          if (nextState?.completed) {
            onCompleteRef.current(nextState.isFlawless);
            break;
          }
          if (getCurrentWordIndexRef.current() > beforeIdx) break;
        }
      }

      if (nativeActiveRef.current) {
        setTimeout(() => {
          if (nativeActiveRef.current) void listenWithNativeRecognition();
        }, COOLDOWN_AFTER_AYAH_MS);
      }
    } catch (error: unknown) {
      const message = String(
        (error as { message?: unknown })?.message ?? error ?? '',
      ).toLowerCase();
      const isSilence =
        message.includes('no match') ||
        message.includes('speech timeout') ||
        message.includes('no speech') ||
        message.includes('timed out');

      if (isSilence && nativeActiveRef.current) {
        setTimeout(() => {
          if (nativeActiveRef.current) void listenWithNativeRecognition();
        }, SILENCE_RETRY_DELAY_MS);
        return;
      }

      nativeActiveRef.current = false;
      markUnavailable();
    }
  }, [lang, markUnavailable]);

  // ─────────────── Web engine setup ───────────────
  useEffect(() => {
    if (isNativePlatform) return;

    const SpeechRecognitionCtor = getSpeechRecognitionConstructor();
    if (!SpeechRecognitionCtor) return;

    let recognition: SpeechRecognitionLike;
    try {
      recognition = new SpeechRecognitionCtor();
    } catch {
      setIsSupported(false);
      return;
    }

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 3;
    recognition.lang = lang;

    recognition.onstart = () => {
      if (enabledRef.current) setIsListening(true);
    };

    recognition.onend = () => {
      if (!enabledRef.current || !shouldListenRef.current()) {
        setIsListening(false);
        return;
      }

      setTimeout(() => {
        if (!enabledRef.current || !shouldListenRef.current()) return;
        try {
          recognition.start();
          setIsListening(true);
        } catch (error) {
          if (error instanceof DOMException && error.name === 'InvalidStateError') {
            setIsListening(true);
            return;
          }
          markUnavailable();
        }
      }, RESTART_DELAY_MS);
    };

    recognition.onerror = (event) => {
      if (!FATAL_ERRORS.includes(event.error)) return;
      markUnavailable();
      try {
        recognition.stop();
      } catch {
        // Already stopped — nothing to do.
      }
    };

    recognition.onresult = (event) => {
      if (!enabledRef.current) return;
      if (nowMs() < cooldownUntilRef.current) return;

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result.isFinal) continue;

        let progressed = false;
        const maxAlternatives = Math.min(result.length, 3);
        for (let alt = 0; alt < maxAlternatives; alt++) {
          const transcript = result[alt].transcript.trim();
          const confidence = result[alt].confidence ?? 0.5;
          if (!transcript) continue;

          const beforeIdx = getCurrentWordIndexRef.current();
          const nextState = onTranscriptRef.current(transcript, confidence);
          if (nextState?.completed) {
            onCompleteRef.current(nextState.isFlawless);
            return;
          }
          if (getCurrentWordIndexRef.current() > beforeIdx) {
            progressed = true;
            break;
          }
        }
        if (progressed) break;
      }
    };

    recognitionRef.current = recognition;

    return () => {
      requestIdRef.current += 1;
      enabledRef.current = false;
      recognitionRef.current = null;
      try {
        recognition.abort();
      } catch {
        // Already aborted — nothing to do.
      }
    };
  }, [lang, markUnavailable]);

  // ─────────────── Native listening-state listener ───────────────
  useEffect(() => {
    if (!isNativePlatform) return;

    let handle: { remove: () => Promise<void> } | null = null;
    let cancelled = false;

    const setup = async () => {
      try {
        handle = await SpeechRecognition.addListener(
          'listeningState',
          (data: { status: 'started' | 'stopped' }) => {
            if (cancelled) return;
            if (data.status !== 'stopped') return;
            if (!nativeActiveRef.current || !shouldListenRef.current()) return;

            setTimeout(() => {
              if (nativeActiveRef.current && shouldListenRef.current()) {
                void listenWithNativeRecognition();
              }
            }, NATIVE_RESTART_DELAY_MS);
          },
        );
      } catch {
        // The platform does not emit listening-state events; polling still works.
      }
    };

    void setup();

    return () => {
      cancelled = true;
      void handle?.remove().catch(() => {});
    };
  }, [listenWithNativeRecognition]);

  // ─────────────── Start / stop ───────────────
  const start = useCallback(async () => {
    if (enabledRef.current) return;

    enabledRef.current = true;
    const requestId = ++requestIdRef.current;
    setIsListening(true);
    cooldownUntilRef.current = 0;

    if (!isNativePlatform) {
      const recognition = recognitionRef.current;
      if (!isSupported || !recognition) {
        markUnavailable();
        return;
      }

      try {
        recognition.start();
        setIsListening(true);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'InvalidStateError') {
          setIsListening(true);
          return;
        }
        markUnavailable();
      }
      return;
    }

    try {
      const { available } = await SpeechRecognition.available();
      if (requestId !== requestIdRef.current) return;
      if (!available) {
        setIsSupported(false);
        markUnavailable();
        return;
      }

      let permission = await SpeechRecognition.checkPermissions();
      if (permission.speechRecognition !== 'granted') {
        permission = await SpeechRecognition.requestPermissions();
      }
      if (requestId !== requestIdRef.current) return;
      if (permission.speechRecognition !== 'granted') {
        markUnavailable();
        return;
      }

      nativeActiveRef.current = true;
      void listenWithNativeRecognition();
    } catch {
      markUnavailable();
    }
  }, [isSupported, listenWithNativeRecognition, markUnavailable]);

  const stop = useCallback(async () => {
    requestIdRef.current += 1;
    const wasEnabled = enabledRef.current;
    enabledRef.current = false;
    setIsListening(false);

    if (isNativePlatform) {
      if (!nativeActiveRef.current) return;
      nativeActiveRef.current = false;
      try {
        await SpeechRecognition.stop();
      } catch {
        // Recognition already stopped.
      }
      return;
    }

    if (recognitionRef.current && wasEnabled) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Recognition already stopped.
      }
    }
  }, []);

  const setCooldown = useCallback((durationMs = COOLDOWN_AFTER_AYAH_MS) => {
    cooldownUntilRef.current = nowMs() + durationMs;
  }, []);

  return { isListening, isSupported, start, stop, setCooldown };
}
