import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../utils/cn';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  /** `true` paints the button as pressed/active. */
  active?: boolean;
  tone?: 'neutral' | 'emerald' | 'amber' | 'rose';
  children: ReactNode;
}

const TONES: Record<NonNullable<IconButtonProps['tone']>, { idle: string; active: string }> = {
  neutral: {
    idle: 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50',
    active: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  },
  emerald: {
    idle: 'border-stone-200 bg-white text-emerald-700 hover:bg-emerald-50',
    active: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  },
  amber: {
    idle: 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100',
    active: 'border-amber-300 bg-amber-100 text-amber-800',
  },
  rose: {
    idle: 'border-stone-200 bg-white text-rose-600 hover:bg-rose-50',
    active: 'border-rose-300 bg-rose-50 text-rose-700',
  },
};

export function IconButton({
  label,
  active = false,
  tone = 'neutral',
  className,
  children,
  type = 'button',
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cn(
        'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:cursor-not-allowed disabled:opacity-35',
        active ? TONES[tone].active : TONES[tone].idle,
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
