'use client';

import { forwardRef, useEffect, useMemo, useRef } from 'react';

import { cn } from '@/lib/utils';

import { highlightTokens } from './utils';

type TokenTextareaProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  minRows?: number;
};

export const TokenTextarea = forwardRef<HTMLTextAreaElement, TokenTextareaProps>(function TokenTextarea(
  { value, onChange, placeholder, disabled = false, minRows = 4 }: TokenTextareaProps,
  forwardedRef
) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  const highlighted = useMemo(() => {
    const text = value.length === 0 ? placeholder ?? '' : value;
    const html = highlightTokens(text);
    return value.length === 0 ? `<span class=\"text-muted-foreground\">${html}</span>` : html;
  }, [value, placeholder]);

  useEffect(() => {
    if (!textareaRef.current || !overlayRef.current) {
      return;
    }
    overlayRef.current.scrollTop = textareaRef.current.scrollTop;
    overlayRef.current.scrollLeft = textareaRef.current.scrollLeft;
  }, [value]);

  const handleScroll = () => {
    if (!textareaRef.current || !overlayRef.current) {
      return;
    }
    overlayRef.current.scrollTop = textareaRef.current.scrollTop;
    overlayRef.current.scrollLeft = textareaRef.current.scrollLeft;
  };

  return (
    <div className="relative">
      <div
        ref={overlayRef}
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-0 whitespace-pre-wrap rounded-md border border-transparent bg-background px-3 py-2 font-sans text-sm leading-relaxed text-foreground',
          disabled && 'opacity-60'
        )}
        dangerouslySetInnerHTML={{ __html: highlighted.length > 0 ? highlighted : '&nbsp;' }}
      />
      <textarea
        ref={(node) => {
          textareaRef.current = node;
          if (typeof forwardedRef === 'function') {
            forwardedRef(node);
          } else if (forwardedRef) {
            forwardedRef.current = node;
          }
        }}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        onScroll={handleScroll}
        rows={minRows}
        className="relative z-10 w-full resize-y rounded-md border border-border/60 bg-transparent px-3 py-2 font-sans text-sm leading-relaxed text-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        style={{ caretColor: 'hsl(var(--foreground))' }}
      />
    </div>
  );
});
