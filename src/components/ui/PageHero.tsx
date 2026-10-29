import type { ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
import { cn } from '../../utils/cn';

export interface PageHeroProps {
  eyebrow?: string;
  title: string;
  description?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

/** Dark emerald banner used at the top of the main screens. */
export function PageHero({
  eyebrow,
  title,
  description,
  icon,
  actions,
  className,
}: PageHeroProps) {
  return (
    <section
      className={cn(
        'relative overflow-hidden rounded-3xl bg-emerald-950 px-6 py-8 text-white shadow-sm sm:px-9 sm:py-10',
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-12 -top-16 h-56 w-56 rounded-full border border-emerald-700/40"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-5 -top-9 h-40 w-40 rounded-full border border-emerald-700/30"
      />
      <div className="relative z-10 max-w-2xl space-y-4">
        {eyebrow && (
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-700 bg-emerald-900/70 px-3 py-1 text-xs font-semibold text-amber-200">
            {icon ?? <Sparkles className="h-4 w-4" />}
            {eyebrow}
          </span>
        )}
        <h1 className="font-serif text-3xl font-bold leading-tight sm:text-4xl">{title}</h1>
        {description && (
          <p className="max-w-xl text-sm leading-7 text-emerald-100">{description}</p>
        )}
        {actions && <div className="flex flex-wrap gap-3 pt-1">{actions}</div>}
      </div>
    </section>
  );
}
