'use client';

import { useEffect, useState } from 'react';
import type { ShareScope } from '@/lib/share';

/**
 * Shows the generated PNG and offers the two things anybody does with it:
 * send it somewhere, or save it.
 *
 * The image is rendered on the server, so what is previewed here is exactly
 * the file that gets shared — no canvas library, and no chance of a card that
 * renders differently on somebody else's phone.
 */
export function ShareCard({ scope, onClose }: { scope: ShareScope; onClose: () => void }) {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [canSend, setCanSend] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    fetch(`/api/share?scope=${scope}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('could not render');
        const data = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(data);
        setBlob(data);
        setUrl(objectUrl);
        setState('ready');
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [scope]);

  // Sharing a file is a phone capability. Desktop browsers mostly cannot, so
  // the button only appears where it will actually work.
  useEffect(() => {
    if (!blob) return;
    const file = new File([blob], 'winner.png', { type: 'image/png' });
    setCanSend(typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] }));
  }, [blob]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  const send = async () => {
    if (!blob) return;
    const file = new File([blob], `${scope}-winner.png`, { type: 'image/png' });
    try {
      await navigator.share({ files: [file] });
    } catch {
      // Cancelling the sheet rejects, which is not a failure worth reporting.
    }
  };

  const download = () => {
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = `${scope}-winner.png`;
    a.click();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-7">
      <div onClick={onClose} aria-hidden="true" className="fpl-scrim absolute inset-0 bg-[rgba(12,8,20,0.5)]" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Share this winner"
        className="relative flex max-h-full w-full max-w-[460px] flex-col overflow-hidden rounded-[6px] border border-line bg-bg shadow-[0_24px_60px_rgba(12,8,20,0.28)]"
      >
        <div className="aspect-square w-full bg-panel">
          {state === 'ready' && url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="Winner card" className="block h-full w-full" />
          )}
          {state === 'loading' && <div className="fpl-skeleton h-full w-full bg-hair" />}
          {state === 'error' && (
            <div className="flex h-full items-center justify-center px-8 text-center font-mono text-[12px] text-dim">
              Could not draw the card. Nothing has settled yet, or FPL is unreachable.
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-line bg-panel px-[18px] pt-4 pb-[18px]">
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-[10px] tracking-[0.08em] text-dim">
              1080 × 1080 PNG
            </span>
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer border-none bg-transparent p-0 font-mono text-[10px] tracking-[0.12em] text-dim uppercase hover:text-accent"
            >
              Close
            </button>
          </div>

          <div className="flex gap-2.5">
            {canSend && (
              <button
                type="button"
                onClick={send}
                disabled={state !== 'ready'}
                className="flex-1 cursor-pointer rounded-[4px] border border-accent bg-accent px-4 py-3 font-sans text-[12px] font-semibold tracking-[0.08em] text-accent-ink uppercase disabled:opacity-50"
              >
                Share
              </button>
            )}
            <button
              type="button"
              onClick={download}
              disabled={state !== 'ready'}
              className={`cursor-pointer rounded-[4px] border border-line bg-bg px-4 py-3 font-sans text-[12px] font-semibold tracking-[0.08em] text-ink uppercase hover:border-accent hover:text-accent disabled:opacity-50 ${
                canSend ? 'flex-none' : 'flex-1'
              }`}
            >
              Download PNG
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
