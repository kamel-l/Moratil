import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';

export type BadgeTone = 'emerald' | 'amber' | 'rose' | 'stone' | 'teal';

const TONES: Record<BadgeTone, string> = {
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  amber: 'border-amber-200 bg-amber-50 text-amber-900',
  rose: 'border-rose-200 bg-rose-50 text-rose-800',
  stone: 'border-stone-200 bg-stone-100 text-stone-700',
  teal: 'border-teal-200 bg-teal-50 text-teal-800',
};

export interface BadgeProps {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}

export function Badge({ tone = 'stone', className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold leading-5',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
