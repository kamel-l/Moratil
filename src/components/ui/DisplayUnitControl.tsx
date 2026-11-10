import React from 'react';
import { LayoutGrid } from 'lucide-react';
import { DisplayUnit } from '../../utils/displayUnits';

interface DisplayUnitControlProps {
  value: DisplayUnit;
  onChange: (unit: DisplayUnit) => void;
}

const OPTIONS: { value: DisplayUnit; label: string; title: string }[] = [
  { value: 1, label: '١', title: 'آية واحدة' },
  { value: 3, label: '٣', title: 'ثلاث آيات' },
  { value: 5, label: '٥', title: 'خمس آيات' },
  { value: 'page', label: 'صفحة', title: 'صفحة كاملة من المصحف' },
];

/** مبدّل وحدة العرض (آية / ٣ آيات / ٥ آيات / صفحة كاملة من المصحف). */
export const DisplayUnitControl: React.FC<DisplayUnitControlProps> = ({ value, onChange }) => (
  <div className="flex items-center gap-2">
    <span className="flex items-center gap-1 text-[11px] font-semibold text-jade-100/60">
      <LayoutGrid className="w-3.5 h-3.5 text-gold-300" />
      عرض
    </span>
    <div className="flex items-center gap-1 bg-white/5 p-1 rounded-xl border border-white/10">
      {OPTIONS.map((option) => (
        <button
          key={String(option.value)}
          onClick={() => onChange(option.value)}
          title={option.title}
          className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
            value === option.value
              ? 'bg-gold-400 text-jade-950'
              : 'text-jade-100/70 hover:text-white'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  </div>
);
