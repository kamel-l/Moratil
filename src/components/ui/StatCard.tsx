import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';

export type StatTone = 'emerald' | 'amber' | 'rose' | 'stone' | 'teal';

const TONES: Record<StatTone, { card: string; icon: string; value: string }> = {
  emerald: {
    card: 'border-emerald-200 bg-emerald-50/60',
    icon: 'bg-white text-emerald-800',
    value: 'text-emerald-900',
  },
  amber: {
    card: 'border-amber-200 bg-amber-50/70',
    icon: 'bg-white text-amber-700',
    value: 'text-amber-900',
  },
  rose: {
    card: 'border-rose-200 bg-rose-50/70',
    icon: 'bg-white text-rose-700',
    value: 'text-rose-900',
  },
  stone: {
    card: 'border-stone-200 bg-white',
    icon: 'bg-stone-100 text-stone-700',
    value: 'text-stone-900',
  },
  teal: {
    card: 'border-teal-200 bg-teal-50/70',
    icon: 'bg-white text-teal-700',
    value: 'text-teal-900',
  },
};

export interface StatCardProps {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  tone?: StatTone;
  className?: string;
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'stone',
  className,
}: StatCardProps) {
  const styles = TONES[tone];

  return (
    <article className={cn('rounded-2xl border p-5 shadow-xs', styles.card, className)}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold text-stone-600">{label}</span>
        {icon && (
          <span
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-xl shadow-xs',
              styles.icon,
            )}
          >
            {icon}
          </span>
        )}
      </div>
      <p className={cn('mt-3 text-2xl font-bold tabular-nums', styles.value)}>{value}</p>
      {hint && <p className="mt-1 text-[11px] leading-relaxed text-stone-500">{hint}</p>}
    </article>
  );
}
