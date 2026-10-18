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
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 space-y-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stone-100 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-100 text-emerald-800">
              <BookOpen className="w-5 h-5 text-emerald-700" />
            </div>
            <div>
              <h3 className="font-bold text-stone-900 text-base">التفسير الميسر ومعاني الكلمات</h3>
              <p className="text-xs text-stone-500">
                سورة {surahName} · الآية رقم {ayah.numberInSurah} · الجزء {ayah.juz}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-700 p-2 rounded-xl hover:bg-stone-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Ayah Scripture */}
        <div className="bg-stone-50 rounded-2xl p-6 text-center border border-stone-100">
          <div className="font-quran text-2xl sm:text-3xl text-stone-800 leading-loose">
            {ayah.text}
          </div>
          {onPlayAudio && (
            <button
              onClick={onPlayAudio}
              className="mt-4 inline-flex items-center gap-1.5 text-xs text-emerald-700 hover:text-emerald-800 bg-white border border-stone-200 px-3 py-1.5 rounded-xl font-semibold shadow-xs"
            >
              <Volume2 className="w-4 h-4 text-emerald-600" />
              <span>استمع لتلاوة الآية</span>
            </button>
          )}
        </div>

        {/* Tafsir Al-Muyassar */}
        <div className="space-y-2">
          <h4 className="font-bold text-emerald-900 text-sm flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-emerald-600" />
            <span>التفسير الميسر:</span>
          </h4>
          <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-4 text-xs sm:text-sm text-stone-700 leading-relaxed font-sans">
            {ayah.tafsir ||
              'التفسير الميسر متاح لهذه الآية؛ يعينك فهم المعنى على استحضار الآيات في الصلاة وتثبيت الحفظ في الذاكرة.'}
          </div>
        </div>

        {/* Key Words Meanings (غريب القرآن) */}
        {ayah.keyWordsMeaning && ayah.keyWordsMeaning.length > 0 && (
          <div className="space-y-2.5">
            <h4 className="font-bold text-stone-900 text-sm">معاني الكلمات ودلالاتها:</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {ayah.keyWordsMeaning.map((item, idx) => (
                <div
                  key={idx}
                  className="bg-stone-50 border border-stone-200/80 rounded-xl p-3 text-xs"
                >
                  <span className="font-bold font-quran text-base text-emerald-800 block">
                    {item.word}
                  </span>
                  <span className="text-stone-600">{item.meaning}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="pt-2 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs shadow-xs cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
