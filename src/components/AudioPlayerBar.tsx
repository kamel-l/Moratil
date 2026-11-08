import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Repeat,
  VolumeX,
  X,
  ChevronUp,
  ChevronDown,
  UserCheck,
} from 'lucide-react';
import { Reciter, Surah, Ayah } from '../types/quran';
import { POPULAR_RECITERS, getAyahAudioUrl } from '../utils/audioReciters';
import { formatTime } from '../utils/arabicUtils';

interface AudioPlayerBarProps {
  currentSurah: Surah;
  currentAyahNumber: number;
  selectedReciter: Reciter;
  onSelectReciter: (reciter: Reciter) => void;
  onClose: () => void;
  onAyahChange: (ayahNum: number) => void;
  isOpen: boolean;
}

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
  const [repeatMode, setRepeatMode] = useState<1 | 3 | 5 | 99>(1); // 99 = continuous repeat
  const [repeatCounter, setRepeatCounter] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [showReciterPicker, setShowReciterPicker] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const currentAyah =
    currentSurah.ayahs.find((a) => a.numberInSurah === currentAyahNumber) || currentSurah.ayahs[0];

  // Update audio source when reciter, surah, or ayah changes
  useEffect(() => {
    const url = getAyahAudioUrl(selectedReciter.id, currentSurah.number, currentAyahNumber);
    if (!audioRef.current) {
      audioRef.current = new Audio(url);
    } else {
      audioRef.current.src = url;
    }

    audioRef.current.playbackRate = playbackSpeed;

    const audio = audioRef.current;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => setDuration(audio.duration);
    const handleEnded = () => {
      // Handle repeat mode
      if (repeatMode === 99 || repeatCounter + 1 < repeatMode) {
        setRepeatCounter((prev) => prev + 1);
        audio.currentTime = 0;
        audio.play().catch(() => {});
      } else {
        setRepeatCounter(0);
        // Advance to next Ayah in Surah if available
        if (currentAyahNumber < currentSurah.ayahs.length) {
          onAyahChange(currentAyahNumber + 1);
        } else {
          setIsPlaying(false);
        }
      }
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);

    if (isPlaying) {
      audio.play().catch((e) => {
        console.warn('Autoplay blocked', e);
        setIsPlaying(false);
      });
    }

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [selectedReciter.id, currentSurah.number, currentAyahNumber, repeatMode, repeatCounter]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = val;
      setCurrentTime(val);
    }
  };

  const cycleSpeed = () => {
    const speeds = [0.75, 1.0, 1.25];
    const currentIdx = speeds.indexOf(playbackSpeed);
    const nextSpeed = speeds[(currentIdx + 1) % speeds.length];
    setPlaybackSpeed(nextSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextSpeed;
    }
  };

  const cycleRepeat = () => {
    const modes: (1 | 3 | 5 | 99)[] = [1, 3, 5, 99];
    const currentIdx = modes.indexOf(repeatMode);
    const next = modes[(currentIdx + 1) % modes.length];
    setRepeatMode(next);
    setRepeatCounter(0);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-jade-950/95 backdrop-blur-md text-white border-t border-white/10 shadow-2xl p-3 sm:p-4 animate-in slide-in-from-bottom">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Reciter Info & Surah Info */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-start">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gold-400 flex items-center justify-center text-jade-950 font-display font-bold text-lg shadow-inner">
              قرآن
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-white font-display">
                  سورة {currentSurah.name} (آية {currentAyahNumber})
                </span>
                {selectedReciter.hasTeacherStyle && (
                  <span className="text-[10px] bg-gold-400/15 text-gold-200 border border-gold-400/30 px-1.5 py-0.2 rounded-md font-medium">
                    مصحف معلّم
                  </span>
                )}
              </div>
              <button
                onClick={() => setShowReciterPicker(!showReciterPicker)}
                className="text-xs text-jade-100/60 hover:text-gold-300 flex items-center gap-1 transition-colors"
              >
                <span>القارئ: {selectedReciter.name}</span>
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <button onClick={onClose} className="md:hidden text-jade-100/60 hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Audio Controls */}
        <div className="flex flex-col items-center gap-1.5 w-full md:max-w-md">
          <div className="flex items-center gap-4">
            {/* Speed Toggle */}
            <button
              onClick={cycleSpeed}
              className="text-[11px] font-bold text-jade-100/60 hover:text-white px-2 py-1 rounded-md hover:bg-white/10 transition-colors"
              title="سرعة التلاوة"
            >
              {playbackSpeed}x
            </button>

            {/* Prev Ayah */}
            <button
              onClick={() => onAyahChange(Math.max(1, currentAyahNumber - 1))}
              disabled={currentAyahNumber <= 1}
              className="text-jade-100/70 hover:text-white disabled:opacity-30 transition-colors p-1"
              title="الآية السابقة"
            >
              <SkipForward className="w-4 h-4" />
            </button>

            {/* Play / Pause Main Button */}
            <button
              onClick={togglePlay}
              className="w-10 h-10 rounded-full bg-gold-400 hover:bg-gold-300 text-jade-950 flex items-center justify-center shadow-lg transition-transform active:scale-95 cursor-pointer"
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 mr-0.5" />}
            </button>

            {/* Next Ayah */}
            <button
              onClick={() =>
                onAyahChange(Math.min(currentSurah.ayahs.length, currentAyahNumber + 1))
              }
              disabled={currentAyahNumber >= currentSurah.ayahs.length}
              className="text-jade-100/70 hover:text-white disabled:opacity-30 transition-colors p-1"
              title="الآية التالية"
            >
              <SkipBack className="w-4 h-4" />
            </button>

            {/* Repeat Mode */}
            <button
              onClick={cycleRepeat}
              className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-md transition-colors ${
                repeatMode > 1
                  ? 'bg-gold-400/15 text-gold-200 border border-gold-400/30'
                  : 'text-jade-100/60 hover:text-white'
              }`}
              title="تكرار الآية لتثبيت الحفظ"
            >
              <Repeat className="w-3.5 h-3.5" />
              <span>{repeatMode === 99 ? '∞' : `${repeatMode}x`}</span>
            </button>
          </div>

          {/* Progress Bar & Timestamps */}
          <div className="flex items-center gap-2 w-full text-[10px] text-jade-100/60">
            <span>{formatTime(currentTime)}</span>
            <input
              type="range"
              min={0}
              max={duration || 100}
              value={currentTime}
              onChange={handleSeek}
              className="w-full h-1 bg-white/15 rounded-lg appearance-none cursor-pointer accent-[#e0b544]"
            />
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Close Button Desktop */}
        <div className="hidden md:flex items-center gap-3">
          <button
            onClick={onClose}
            className="text-jade-100/60 hover:text-white p-2 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
            title="إغلاق المشغل"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Reciters Modal / Dropdown Picker */}
      {showReciterPicker && (
        <div className="max-w-2xl mx-auto mt-3 pt-3 border-t border-white/10 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          {POPULAR_RECITERS.map((r) => {
            const isCurrent = r.id === selectedReciter.id;
            return (
              <button
                key={r.id}
                onClick={() => {
                  onSelectReciter(r);
                  setShowReciterPicker(false);
                }}
                className={`p-2.5 rounded-xl text-right flex items-center justify-between transition-colors ${
                  isCurrent
                    ? 'bg-gold-400/15 text-gold-200 border border-gold-400/30'
                    : 'bg-white/5 hover:bg-white/10 text-jade-100'
                }`}
              >
                <div>
                  <div className="font-bold text-white">{r.name}</div>
                  <div className="text-[11px] text-jade-100/60">{r.description}</div>
                </div>
                {isCurrent && <UserCheck className="w-4 h-4 text-gold-300" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
