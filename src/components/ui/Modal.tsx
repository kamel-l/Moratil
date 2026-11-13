import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '../../utils/cn';
import { IconButton } from './IconButton';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  icon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Extra classes for the dialog panel (width, padding…). */
  className?: string;
  /** Extra classes for the scrollable body. */
  bodyClassName?: string;
  size?: 'sm' | 'md' | 'lg';
}

const SIZES: Record<NonNullable<ModalProps['size']>, string> = {
  sm: 'max-w-md',
  md: 'max-w-2xl',
  lg: 'max-w-4xl',
};

export function Modal({
  open,
  onClose,
  title,
  description,
  icon,
  children,
  footer,
  className,
  bodyClassName,
  size = 'md',
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    panelRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/60 p-4 backdrop-blur-xs motion-safe:animate-[fade-in_150ms_ease-out]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-modal-title"
        aria-describedby={description ? 'app-modal-description' : undefined}
        tabIndex={-1}
        className={cn(
          'relative flex max-h-[90vh] w-full flex-col overflow-hidden rounded-3xl bg-white shadow-2xl outline-none motion-safe:animate-[slide-up_180ms_ease-out]',
          SIZES[size],
          className,
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-stone-100 px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            {icon && (
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800">
                {icon}
              </span>
            )}
            <div className="min-w-0">
              <h2 id="app-modal-title" className="truncate text-base font-bold text-stone-900">
                {title}
              </h2>
              {description && (
                <p id="app-modal-description" className="mt-0.5 truncate text-xs text-stone-500">
                  {description}
                </p>
              )}
            </div>
          </div>
          <IconButton label="إغلاق" onClick={onClose} className="-me-1">
            <X className="h-4 w-4" />
          </IconButton>
        </header>

        <div className={cn('flex-1 overflow-y-auto px-5 py-5 sm:px-6', bodyClassName)}>{children}</div>

        {footer && (
          <footer className="flex items-center justify-end gap-2 border-t border-stone-100 bg-stone-50/60 px-5 py-4 sm:px-6">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}
