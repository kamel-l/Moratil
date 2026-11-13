import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';

export interface SectionCardProps {
  title?: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

/** White rounded surface with an optional titled header. */
export function SectionCard({
  title,
  description,
  icon,
  action,
  children,
  className,
  bodyClassName,
}: SectionCardProps) {
  return (
    <section
      className={cn('rounded-2xl border border-stone-200 bg-white p-5 shadow-xs', className)}
    >
      {(title || action) && (
        <header className="mb-4 flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            {icon && (
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800">
                {icon}
              </span>
            )}
            <div className="min-w-0">
              {title && <h2 className="font-bold text-stone-900">{title}</h2>}
              {description && (
                <p className="mt-0.5 text-xs leading-relaxed text-stone-500">{description}</p>
              )}
            </div>
          </div>
          {action}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}
