import { cn } from '../../utils/cn';

export interface ProgressBarProps {
  /** Percentage between 0 and 100. */
  value: number;
  label: string;
  tone?: 'emerald' | 'amber' | 'rose' | 'teal';
  size?: 'sm' | 'md';
  className?: string;
}

const TONES: Record<NonNullable<ProgressBarProps['tone']>, string> = {
  emerald: 'bg-emerald-700',
  amber: 'bg-amber-500',
  rose: 'bg-rose-600',
  teal: 'bg-teal-500',
};

const SIZES: Record<NonNullable<ProgressBarProps['size']>, string> = {
  sm: 'h-2',
  md: 'h-3',
};

export function ProgressBar({
  value,
  label,
  tone = 'emerald',
  size = 'md',
  className,
}: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));

  return (
    <div
      className={cn('overflow-hidden rounded-full bg-stone-100', SIZES[size], className)}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
    >
      <div
        className={cn('h-full rounded-full transition-[width] duration-500', TONES[tone])}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
