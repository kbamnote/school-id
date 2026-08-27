import { Printer, ShieldCheck, Layers, CheckCircle2 } from 'lucide-react';

const PIPELINE = [
  'Collect verified data from your people',
  'Review, correct and approve every record',
  'Group approved records into a printing lot',
  'Track proof, printing and dispatch to completion',
];

/**
 * Split layout for every unauthenticated screen. The left panel states what
 * the platform actually does, so a first-time user landing on a link knows
 * where they are before signing in.
 */
export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* Brand / value panel - hidden on small screens where it would just push the form down */}
      <aside className="relative hidden overflow-hidden bg-ink-900 p-10 lg:flex lg:flex-col lg:justify-between">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.18]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 18% 12%, #3167ff 0, transparent 42%), radial-gradient(circle at 82% 82%, #ff7d12 0, transparent 46%)',
          }}
          aria-hidden="true"
        />

        <div className="relative">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-xl bg-brand-600 text-white shadow-raised">
              <Printer size={21} aria-hidden="true" />
            </span>
            <div>
              <p className="text-[0.9375rem] font-semibold tracking-tight text-white">
                MR Print World
              </p>
              <p className="text-xs text-ink-400">Print Data Platform</p>
            </div>
          </div>
        </div>

        <div className="relative max-w-md">
          <h1 className="text-3xl leading-tight font-semibold tracking-tight text-white">
            From data collection to finished print, in one tracked pipeline.
          </h1>
          <ul className="mt-8 space-y-3.5">
            {PIPELINE.map((step) => (
              <li key={step} className="flex items-start gap-3">
                <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-brand-400" aria-hidden="true" />
                <span className="text-sm leading-relaxed text-ink-300">{step}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative flex items-center gap-6 text-xs text-ink-400">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck size={14} aria-hidden="true" /> Isolated client data
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Layers size={14} aria-hidden="true" /> Full audit trail
          </span>
        </div>
      </aside>

      {/* Form panel */}
      <main className="flex items-center justify-center bg-ink-100 px-5 py-10 sm:px-8">
        <div className="w-full max-w-[26rem]">
          {/* Compact brand mark for mobile, where the aside is hidden */}
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="grid size-9 place-items-center rounded-lg bg-brand-600 text-white">
              <Printer size={17} aria-hidden="true" />
            </span>
            <span className="text-sm font-semibold text-ink-900">MR Print World</span>
          </div>

          <h2 className="text-2xl font-semibold tracking-tight text-ink-900">{title}</h2>
          {subtitle && <p className="mt-2 text-sm leading-relaxed text-ink-500">{subtitle}</p>}

          <div className="mt-7">{children}</div>

          {footer && <div className="mt-6">{footer}</div>}

          <p className="mt-10 text-center text-xs text-ink-400">
            &copy; {new Date().getFullYear()} MR Print World Pvt. Ltd.
          </p>
        </div>
      </main>
    </div>
  );
}
