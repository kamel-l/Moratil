import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  Pause,
  Play,
  Repeat,
  SkipBack,
  SkipForward,
  UserCheck,
  X,
} from 'lucide-react';
import { Reciter, Surah } from '../types/quran';
import { POPULAR_RECITERS, getAyahAudioUrl } from '../utils/audioReciters';
import { formatTime } from '../utils/arabicUtils';
import { cn } from '../utils/cn';

interface AudioPlayerBarProps {
  currentSurah: Surah;
  currentAyahNumber: number;
  selectedReciter: Reciter;
  onSelectReciter: (reciter: Reciter) => void;
  onClose: () => void;
  onAyahChange: (ayahNum: number) => void;
  isOpen: boolean;
}

type RepeatMode = 1 | 3 | 5 | 99;
const REPEAT_MODES: RepeatMode[] = [1, 3, 5, 99];
const SPEEDS = [0.75, 1, 1.25];

const controlClass =
  'inline-flex items-center justify-center rounded-lg p-1 text-stone-300 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 disabled:cursor-not-allowed disabled:opacity-30';

export const AudioPlayerBar: React.FC<AudioPlayerBarProps> = ({
  currentSurah,
  currentAyahNumber,
  selectedReciter,
  onSelectReciter,
  onClose,
  onAyahChange,
  isOpen,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>(1);
  const [repeatCounter, setRepeatCounter] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [showReciterPicker, setShowReciterPicker] = useState(false);

  const audioRef = useRef<HTMLAudioElement>(null);

  // Stop playback when the player is closed.
  useEffect(() => {
    if (isOpen) return;
    audioRef.current?.pause();
    setIsPlaying(false);
  }, [isOpen]);

  // Keep the audio source in sync with the selected reciter, surah and ayah.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.src = getAyahAudioUrl(selectedReciter.id, currentSurah.number, currentAyahNumber);
    setCurrentTime(0);
    setDuration(0);
    setRepeatCounter(0);
  }, [selectedReciter.id, currentSurah.number, currentAyahNumber]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = playbackSpeed;
  }, [playbackSpeed]);

  // Reflect the play/pause state onto the audio element.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!isPlaying) {
      audio.pause();
      return;
    }

    void audio.play().catch((error: unknown) => {
      console.warn('Audio playback was blocked:', error);
      setIsPlaying(false);
    });
  }, [isPlaying, selectedReciter.id, currentSurah.number, currentAyahNumber]);

  // Media element events.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, []);

  // Repeat handling and automatic progression to the next ayah.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleEnded = () => {
      if (repeatMode === 99 || repeatCounter + 1 < repeatMode) {
        setRepeatCounter((previous) => previous + 1);
        audio.currentTime = 0;
        void audio.play().catch((error: unknown) => {
          console.warn('Unable to repeat ayah:', error);
          setIsPlaying(false);
        });
        return;
      }

      setRepeatCounter(0);
      if (currentAyahNumber < currentSurah.ayahs.length) {
        onAyahChange(currentAyahNumber + 1);
      } else {
        setIsPlaying(false);
      }
    };

    audio.addEventListener('ended', handleEnded);
    return () => audio.removeEventListener('ended', handleEnded);
  }, [repeatMode, repeatCounter, currentAyahNumber, currentSurah.ayahs.length, onAyahChange]);

  const togglePlay = useCallback(() => {
    setIsPlaying((playing) => !playing);
  }, []);

  const handleSeek = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value);
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = value;
    setCurrentTime(value);
  };

  const cycleSpeed = () => {
    const currentIndex = SPEEDS.indexOf(playbackSpeed);
    setPlaybackSpeed(SPEEDS[(currentIndex + 1) % SPEEDS.length]);
  };

  const cycleRepeat = () => {
    const currentIndex = REPEAT_MODES.indexOf(repeatMode);
    setRepeatMode(REPEAT_MODES[(currentIndex + 1) % REPEAT_MODES.length]);
    setRepeatCounter(0);
  };

  const isRepeatActive = repeatMode > 1;

  return (
    <>
      <audio ref={audioRef} preload="metadata" className="hidden" />

      {isOpen && (
        <div
          className="fixed bottom-0 left-0 right-0 z-50 border-t border-stone-800 bg-stone-900/95 p-3 text-white shadow-2xl backdrop-blur-md motion-safe:animate-[slide-up_180ms_ease-out] sm:p-4"
          role="region"
          aria-label="مشغل التلاوة"
        >
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 md:flex-row">
            <div className="flex w-full items-center justify-between gap-3 md:w-auto md:justify-start">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-800 font-serif text-lg font-bold text-amber-300 shadow-inner">
                  قرآن
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-serif text-sm font-bold text-stone-100">
                      سورة {currentSurah.name} (آية {currentAyahNumber})
                    </span>
                    {selectedReciter.hasTeacherStyle && (
                      <span className="rounded-md border border-emerald-700 bg-emerald-900/90 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
                        مصحف معلّم
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowReciterPicker((open) => !open)}
                    aria-expanded={showReciterPicker}
                    className="flex items-center gap-1 text-xs text-stone-400 transition-colors hover:text-emerald-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
                  >
                    <span>القارئ: {selectedReciter.name}</span>
                    <ChevronDown
                      className={cn('h-3.5 w-3.5 transition-transform', showReciterPicker && 'rotate-180')}
                    />
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className={cn(controlClass, 'md:hidden')}
                aria-label="إغلاق المشغل"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex w-full flex-col items-center gap-1.5 md:max-w-md">
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={cycleSpeed}
                  className="rounded-md px-2 py-1 text-[11px] font-bold text-stone-400 transition-colors hover:bg-stone-800 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
                  title="سرعة التلاوة"
                  aria-label={`سرعة التلاوة ${playbackSpeed}x`}
                >
                  {playbackSpeed}x
                </button>

                <button
                  type="button"
                  onClick={() => onAyahChange(Math.max(1, currentAyahNumber - 1))}
                  disabled={currentAyahNumber <= 1}
                  className={controlClass}
                  title="الآية السابقة"
                  aria-label="الآية السابقة"
                >
                  <SkipForward className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  onClick={togglePlay}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg transition-transform hover:bg-emerald-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 active:scale-95"
                  aria-label={isPlaying ? 'إيقاف مؤقت' : 'تشغيل التلاوة'}
                >
                  {isPlaying ? (
                    <Pause className="h-5 w-5" />
                  ) : (
                    <Play className="mr-0.5 h-5 w-5" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() =>
                    onAyahChange(Math.min(currentSurah.ayahs.length, currentAyahNumber + 1))
                  }
                  disabled={currentAyahNumber >= currentSurah.ayahs.length}
                  className={controlClass}
                  title="الآية التالية"
                  aria-label="الآية التالية"
                >
                  <SkipBack className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  onClick={cycleRepeat}
                  className={cn(
                    'flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400',
                    isRepeatActive
                      ? 'border border-emerald-800 bg-emerald-950 text-emerald-300'
                      : 'text-stone-400 hover:text-white',
                  )}
                  title="تكرار الآية لتثبيت الحفظ"
                  aria-label={`تكرار الآية: ${repeatMode === 99 ? 'مستمر' : `${repeatMode} مرات`}`}
                >
                  <Repeat className="h-3.5 w-3.5" />
                  <span>{repeatMode === 99 ? '∞' : `${repeatMode}x`}</span>
                </button>
              </div>

              <div className="flex w-full items-center gap-2 text-[10px] text-stone-400">
                <span>{formatTime(currentTime)}</span>
                <input
                  type="range"
                  min={0}
                  max={duration || 100}
                  step={0.1}
                  value={currentTime}
                  onChange={handleSeek}
                  aria-label="موضع التلاوة"
                  className="h-1 w-full cursor-pointer appearance-none rounded-lg bg-stone-700 accent-emerald-500"
                />
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            <div className="hidden items-center gap-3 md:flex">
              <button
                type="button"
                onClick={onClose}
                className={cn(controlClass, 'p-2')}
                title="إغلاق المشغل"
                aria-label="إغلاق المشغل"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {showReciterPicker && (
            <div className="mx-auto mt-3 grid max-w-2xl grid-cols-1 gap-2 border-t border-stone-800 pt-3 text-xs sm:grid-cols-2">
              {POPULAR_RECITERS.map((reciter) => {
                const isCurrent = reciter.id === selectedReciter.id;
                return (
                  <button
                    key={reciter.id}
                    type="button"
                    onClick={() => {
                      onSelectReciter(reciter);
                      setShowReciterPicker(false);
                    }}
                    aria-pressed={isCurrent}
                    className={cn(
                      'flex items-center justify-between rounded-xl p-2.5 text-right transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400',
                      isCurrent
                        ? 'border border-emerald-600 bg-emerald-900/80 text-emerald-200'
                        : 'bg-stone-800/80 text-stone-300 hover:bg-stone-700',
                    )}
                  >
                    <div>
                      <div className="font-bold text-stone-100">{reciter.name}</div>
                      <div className="text-[11px] text-stone-400">{reciter.description}</div>
                    </div>
                    {isCurrent && <UserCheck className="h-4 w-4 text-emerald-400" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </>
  );
};
