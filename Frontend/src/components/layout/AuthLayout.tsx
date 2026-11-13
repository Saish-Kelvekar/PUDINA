import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Brain, Route, Signal } from 'lucide-react';
import { Preferences } from '@/components/Preferences';
import { useTheme } from '@/lib/theme';

interface AuthLayoutProps {
  eyebrow: string;
  title: string;
  accent: string;
  description: string;
  children: React.ReactNode;
}

/** Full-screen looping video background with a frosted auth card. */
export function AuthLayout({ eyebrow, title, accent, description, children }: AuthLayoutProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { theme } = useTheme();

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => {
      if (mq.matches) v.pause();
      else v.play().catch(() => {});
    };
    apply();
    mq.addEventListener?.('change', apply);
    return () => mq.removeEventListener?.('change', apply);
  }, []);

  return (
    <div className={`relative min-h-screen w-full overflow-hidden ${theme === 'day' ? 'bg-[#2b2622]' : 'bg-[#14110E]'}`}>
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full object-cover"
        src="/media/login-bg.mp4"
        autoPlay
        muted
        loop
        playsInline
        aria-hidden="true"
      />
      {/* legibility washes */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/65 via-black/30 to-black/10" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/20" />

      <div className="relative z-10 flex min-h-screen flex-col p-4 sm:p-6 lg:p-10">
        {/* Top bar */}
        <header className="flex items-center justify-between">
          <Link to="/login" className="flex items-center gap-3 text-white">
            <Monogram />
            <span className="hidden text-[11px] font-semibold uppercase tracking-[0.35em] sm:block">TrafficVision</span>
          </Link>
          <div className="flex items-center gap-2">
          <Preferences onVideo />
          <div className="rounded-full border border-[rgba(255,255,255,0.15)] bg-[rgba(255,255,255,0.08)] px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-white backdrop-blur-md">
            <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-[#E3A034] align-middle animate-pulse" />
            Live demo
          </div>
          </div>
        </header>

        <main className="flex flex-1 flex-col items-stretch justify-center gap-10 py-10 lg:flex-row lg:items-center lg:justify-between">
          {/* Hero copy */}
          <section className="max-w-xl text-white animate-slide-up">
            <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-[#B3ADA8]">{eyebrow}</p>
            <h1 className="mt-4 font-display text-5xl font-light leading-[0.95] tracking-tight text-shadow sm:text-6xl lg:text-7xl">
              {title}
              <br />
              <span className="italic text-[#E3A034]">{accent}</span>
            </h1>
            <p className="mt-6 max-w-md text-sm leading-relaxed text-[#B3ADA8] sm:text-base">{description}</p>

            <div className="mt-8 hidden max-w-lg grid-cols-3 rounded-3xl border border-[rgba(255,255,255,0.15)] bg-[rgba(255,255,255,0.08)] px-2 py-4 backdrop-blur-md sm:grid">
              {[
                { icon: <Route className="h-4 w-4" />, value: '18', label: 'Junctions mapped' },
                { icon: <Brain className="h-4 w-4" />, value: '15–30', label: 'Minute forecasts' },
                { icon: <Signal className="h-4 w-4" />, value: '3', label: 'Priority vehicles' },
              ].map((s, i) => (
                <div key={s.label} className={`flex flex-col gap-1.5 px-4 ${i > 0 ? 'border-l border-[rgba(255,255,255,0.15)]' : ''}`}>
                  <span className="text-[#2A8E7E]">{s.icon}</span>
                  <span className="font-display text-2xl font-light leading-none text-white">{s.value}</span>
                  <span className="text-[11px] text-[#B3ADA8]">{s.label}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Card */}
          <section className="w-full max-w-md self-center lg:self-auto animate-slide-up [animation-delay:120ms]">
            <div
              className={
                theme === 'day'
                  ? 'theme-light rounded-5xl border border-white/60 bg-sand-50/80 p-7 shadow-frame backdrop-blur-2xl sm:p-9'
                  : 'theme-light rounded-5xl border border-black/5 bg-[#EAE5DF] p-7 shadow-frame sm:p-9'
              }
            >
              {children}
            </div>
          </section>
        </main>

        <footer className="text-[10px] uppercase tracking-[0.3em] text-[#B3ADA8]">
          Routing — Prediction — Signals — Emergency
        </footer>
      </div>
    </div>
  );
}

export function Monogram({ dark = false }: { dark?: boolean }) {
  return (
    <span
      className={`flex h-9 w-9 items-center justify-center rounded-full font-display text-sm italic ${
        dark ? 'bg-ink text-sand-50' : 'bg-[#FFFFFF] text-[#14110E]'
      }`}
    >
      Tv
    </span>
  );
}
