import React from 'react';
import { BookOpen, X, Volume2, Sparkles } from 'lucide-react';
import { Ayah } from '../types/quran';

interface TafsirModalProps {
  ayah: Ayah | null;
  surahName: string;
  onClose: () => void;
  onPlayAudio?: () => void;
}

export const TafsirModal: React.FC<TafsirModalProps> = ({
  ayah,
  surahName,
  onClose,
  onPlayAudio,
}) => {
  if (!ayah) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-jade-900 border border-white/10 text-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 space-y-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-gold-400/15 text-gold-300">
              <BookOpen className="w-5 h-5 text-gold-300" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">التفسير الميسر ومعاني الكلمات</h3>
              <p className="text-xs text-jade-100/60">
                سورة {surahName} · الآية رقم {ayah.numberInSurah} · الجزء {ayah.juz}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-jade-100/60 hover:text-white p-2 rounded-xl hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Ayah Scripture */}
        <div className="bg-white/5 rounded-2xl p-6 text-center border border-white/10">
          <div className="font-quran text-2xl sm:text-3xl text-white leading-loose">
            {ayah.text}
          </div>
          {onPlayAudio && (
            <button
              onClick={onPlayAudio}
              className="mt-4 inline-flex items-center gap-1.5 text-xs bg-white/5 border border-white/10 text-gold-300 hover:text-gold-200 px-3 py-1.5 rounded-xl font-semibold shadow-xs"
            >
              <Volume2 className="w-4 h-4 text-gold-300" />
              <span>استمع لتلاوة الآية</span>
            </button>
          )}
        </div>

        {/* Tafsir Al-Muyassar */}
        <div className="space-y-2">
          <h4 className="font-bold text-gold-200 text-sm flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-gold-300" />
            <span>التفسير الميسر:</span>
          </h4>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-xs sm:text-sm text-jade-100/80 leading-relaxed font-sans">
            {ayah.tafsir ||
              'التفسير الميسر متاح لهذه الآية؛ يعينك فهم المعنى على استحضار الآيات في الصلاة وتثبيت الحفظ في الذاكرة.'}
          </div>
        </div>

        {/* Key Words Meanings (غريب القرآن) */}
        {ayah.keyWordsMeaning && ayah.keyWordsMeaning.length > 0 && (
          <div className="space-y-2.5">
            <h4 className="font-bold text-white text-sm">معاني الكلمات ودلالاتها:</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {ayah.keyWordsMeaning.map((item, idx) => (
                <div
                  key={idx}
                  className="bg-white/5 border border-white/10 rounded-xl p-3 text-xs"
                >
                  <span className="font-bold font-quran text-base text-gold-300 block">
                    {item.word}
                  </span>
                  <span className="text-jade-100/70">{item.meaning}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="pt-2 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-gold-400 hover:bg-gold-300 text-jade-950 font-bold text-xs shadow-xs cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
