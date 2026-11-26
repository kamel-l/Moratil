import { useCallback, useEffect, useRef, useState } from 'react';

export function useAyahAudio() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsPlayingAudio(false);
  }, []);

  const playAudio = useCallback(
    (url: string, onEnded?: () => void, repeatCount = 1, onError?: () => void) => {
      const existingAudio = audioRef.current;
      if (existingAudio && existingAudio.src !== url) {
        existingAudio.pause();
        existingAudio.removeAttribute('src');
        existingAudio.load();
      }

      const audio = existingAudio && existingAudio.src === url ? existingAudio : new Audio(url);
      audioRef.current = audio;

      let remainingPlays = Math.max(1, Math.floor(repeatCount));
      audio.onended = () => {
        remainingPlays -= 1;
        if (remainingPlays > 0) {
          audio.currentTime = 0;
          void audio.play().catch((error: unknown) => {
            console.warn('Unable to repeat ayah audio:', error);
            setIsPlayingAudio(false);
          });
          return;
        }
        setIsPlayingAudio(false);
        onEnded?.();
      };

      audio.onerror = () => {
        setIsPlayingAudio(false);
        audio.onended = null;
        onError?.();
      };

      if (!audio.paused && audio.src === url) {
        audio.pause();
        setIsPlayingAudio(false);
        return;
      }

      audio
        .play()
        .then(() => {
          setIsPlayingAudio(true);
        })
        .catch(() => {
          setIsPlayingAudio(false);
          onError?.();
        });
    },
    [],
  );

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.removeAttribute('src');
        audioRef.current.load();
      }
    };
  }, []);

  return {
    audioRef,
    isPlayingAudio,
    playAudio,
    stopAudio,
    setIsPlayingAudio,
  };
}
