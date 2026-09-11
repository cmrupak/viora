import { useEffect, useState } from 'react';

const INTRO_KEY = 'viora-auth-intro-seen';
const CHAR_MS = 180;
const HOLD_AFTER_HI_MS = 900;
const HOLD_AFTER_WELCOME_MS = 1100;
const FADE_OUT_MS = 700;

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function useAuthIntro() {
  const [showIntro, setShowIntro] = useState(() => {
    if (typeof window === 'undefined') return false;
    if (sessionStorage.getItem(INTRO_KEY) === '1' || prefersReducedMotion()) return false;
    return true;
  });
  const [text, setText] = useState('');
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (!showIntro) return;

    let cancelled = false;
    const timers: number[] = [];

    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        timers.push(window.setTimeout(resolve, ms));
      });

    async function typeLine(full: string) {
      setText('');
      for (let i = 1; i <= full.length; i += 1) {
        if (cancelled) return;
        setText(full.slice(0, i));
        await wait(CHAR_MS);
      }
    }

    async function run() {
      await typeLine('Hi');
      if (cancelled) return;
      await wait(HOLD_AFTER_HI_MS);
      if (cancelled) return;

      await typeLine('Welcome');
      if (cancelled) return;
      await wait(HOLD_AFTER_WELCOME_MS);
      if (cancelled) return;

      setFading(true);
      await wait(FADE_OUT_MS);
      if (cancelled) return;

      sessionStorage.setItem(INTRO_KEY, '1');
      setShowIntro(false);
    }

    void run();

    return () => {
      cancelled = true;
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [showIntro]);

  return { showIntro, text, fading };
}

export function AuthIntroOverlay({ text, fading }: { text: string; fading: boolean }) {
  return (
    <div
      className={`dark fixed inset-0 z-50 grid place-items-center bg-bg text-ink transition-opacity ease-out ${
        fading ? 'opacity-0' : 'opacity-100'
      }`}
      style={{ transitionDuration: `${FADE_OUT_MS}ms` }}
    >
      <p
        className="font-[family-name:var(--font-display)] text-5xl font-bold tracking-tight sm:text-6xl"
        aria-live="polite"
      >
        {text}
        <span
          className={`ml-1 inline-block h-[0.85em] w-[3px] bg-ink align-[-0.05em] ${fading ? 'opacity-0' : 'animate-pulse'}`}
          aria-hidden
        />
      </p>
    </div>
  );
}
