import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../utils/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-emerald-700 text-white shadow-sm hover:bg-emerald-800 focus-visible:outline-emerald-700 disabled:hover:bg-emerald-700',
  secondary:
    'border border-stone-300 bg-white text-stone-800 shadow-xs hover:border-emerald-400 hover:bg-emerald-50/50 focus-visible:outline-emerald-600',
  ghost:
    'text-stone-600 hover:bg-stone-100 hover:text-stone-900 focus-visible:outline-stone-400',
  danger:
    'bg-rose-600 text-white shadow-sm hover:bg-rose-700 focus-visible:outline-rose-600 disabled:hover:bg-rose-600',
  accent:
    'bg-amber-300 text-emerald-950 shadow-sm hover:bg-amber-200 focus-visible:outline-amber-400 disabled:hover:bg-amber-300',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'min-h-9 gap-1.5 rounded-lg px-2.5 text-xs',
  md: 'min-h-10 gap-2 rounded-xl px-3.5 text-xs sm:text-sm',
  lg: 'min-h-12 gap-2 rounded-xl px-5 text-sm',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  icon?: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  icon,
  className,
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-45',
        VARIANTS[variant],
        SIZES[size],
        block && 'w-full',
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}
