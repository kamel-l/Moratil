import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-stone-200 bg-stone-50/60 px-6 py-10 text-center',
        className,
      )}
    >
      {icon && (
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-stone-400 shadow-xs">
          {icon}
        </span>
      )}
      <div className="space-y-1">
        <p className="text-sm font-bold text-stone-800">{title}</p>
        {description && (
          <p className="mx-auto max-w-sm text-xs leading-relaxed text-stone-500">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
