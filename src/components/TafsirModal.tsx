import React from 'react';
import { BookOpen, Sparkles, Volume2 } from 'lucide-react';
import type { Ayah } from '../types/quran';
import { Button, Modal } from './ui';

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
    <Modal
      open
      onClose={onClose}
      title="التفسير الميسر ومعاني الكلمات"
      description={`سورة ${surahName} · الآية رقم ${ayah.numberInSurah} · الجزء ${ayah.juz}`}
      icon={<BookOpen className="h-5 w-5" />}
      footer={
        <Button onClick={onClose} size="md">
          إغلاق
        </Button>
      }
    >
      <div className="space-y-6">
        <div className="rounded-2xl border border-stone-100 bg-stone-50 p-6 text-center">
          <div className="font-quran text-2xl leading-loose text-stone-800 sm:text-3xl">
            {ayah.text}
          </div>
          {onPlayAudio && (
            <Button
              variant="secondary"
              size="sm"
              icon={<Volume2 className="h-4 w-4 text-emerald-600" />}
              onClick={onPlayAudio}
              className="mt-4 bg-white"
            >
              استمع لتلاوة الآية
            </Button>
          )}
        </div>

        <section className="space-y-2">
          <h3 className="flex items-center gap-1.5 text-sm font-bold text-emerald-900">
            <Sparkles className="h-4 w-4 text-emerald-600" />
            <span>التفسير الميسر:</span>
          </h3>
          <p className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4 text-xs leading-relaxed text-stone-700 sm:text-sm">
            {ayah.tafsir ||
              'التفسير الميسر متاح لهذه الآية؛ يعينك فهم المعنى على استحضار الآيات في الصلاة وتثبيت الحفظ في الذاكرة.'}
          </p>
        </section>

        {ayah.keyWordsMeaning && ayah.keyWordsMeaning.length > 0 && (
          <section className="space-y-2.5">
            <h3 className="text-sm font-bold text-stone-900">معاني الكلمات ودلالاتها:</h3>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {ayah.keyWordsMeaning.map((item) => (
                <div
                  key={`${item.word}-${item.meaning}`}
                  className="rounded-xl border border-stone-200/80 bg-stone-50 p-3 text-xs"
                >
                  <span className="block font-quran text-base font-bold text-emerald-800">
                    {item.word}
                  </span>
                  <span className="text-stone-600">{item.meaning}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </Modal>
  );
};
