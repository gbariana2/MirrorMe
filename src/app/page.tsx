import Link from "next/link";

const coreFlows = [
  "Upload a reference choreography clip and a dancer submission.",
  "Render pose overlays for both videos so the comparison is visible.",
  "Flag major and minor form mismatches with timestamps and scores.",
];

const weekPlan = [
  {
    label: "v1",
    timeframe: "Week 6",
    goal: "End-to-end upload, review, and timestamped feedback flow for one dancer video against one reference clip.",
  },
  {
    label: "v2",
    timeframe: "Week 7",
    goal: "Improve comparison quality with better alignment, richer reports, and side-by-side review UX.",
  },
  {
    label: "v3",
    timeframe: "Week 8",
    goal: "Add persistence with Supabase plus a usable review dashboard for repeated submissions.",
  },
  {
    label: "v4",
    timeframe: "Week 9",
    goal: "Polish the full demo for the fair with sharper feedback, better visualizations, and stretch features that prove depth.",
  },
];

const principles = [
  {
    title: "Start narrow",
    copy: "Treat dance as the proving ground and avoid live webcam analysis, multi-user auth, or team views until the core comparison loop is stable.",
  },
  {
    title: "Make feedback inspectable",
    copy: "Every flagged issue should point to a timestamp, a body segment, and a measurable difference so the output is not a black-box score.",
  },
  {
    title: "Ship weekly",
    copy: "Each version needs visible progress in the public repo, not research notes. A thin vertical slice beats an unfinished ambitious branch.",
  },
];

function MirrorMark() {
  return (
    <svg viewBox="0 0 400 120" className="h-14 w-[180px]" role="img" aria-label="MirrorMe MM logo">
      <defs>
        <linearGradient id="mmLeft" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ff5247" />
          <stop offset="45%" stopColor="#ff8f2b" />
          <stop offset="100%" stopColor="#ffd84b" />
        </linearGradient>
        <linearGradient id="mmRight" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#2f95ff" />
          <stop offset="55%" stopColor="#6f67ff" />
          <stop offset="100%" stopColor="#ff57b3" />
        </linearGradient>
      </defs>
      <path d="M0 120V0H40L100 72L160 0H200V120H160V46L100 112L40 46V120Z" fill="url(#mmLeft)" />
      <path d="M200 120V0H240L300 72L360 0H400V120H360V46L300 112L240 46V120Z" fill="url(#mmRight)" />
    </svg>
  );
}

export default function Home() {
  return (
    <main className="phulkari-bg min-h-screen px-5 py-8 text-slate-100 sm:px-10 lg:px-16 lg:py-12">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <section className="rainbow-border relative overflow-hidden rounded-[2rem] p-[1px] shadow-[0_30px_90px_rgba(24,28,58,0.6)]">
          <div className="bubble-glow rounded-[calc(2rem-1px)] border border-white/10 bg-[#0b0d17]/92 px-6 py-8 sm:px-8 lg:px-12 lg:py-12">
            <div className="absolute inset-0 opacity-40 [background-image:radial-gradient(circle_at_15%_20%,rgba(255,84,70,0.28),transparent_18%),radial-gradient(circle_at_83%_18%,rgba(47,149,255,0.3),transparent_20%),radial-gradient(circle_at_85%_84%,rgba(255,216,75,0.2),transparent_20%)]" />

            <div className="relative grid gap-8 lg:grid-cols-[1.25fr_0.95fr]">
              <div className="flex flex-col gap-6">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="inline-flex items-center rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.22em] text-slate-100">
                    MirrorMe
                  </span>
                  <span className="text-sm font-medium text-slate-300">
                    AI-assisted choreography review
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <div className="rounded-2xl border border-white/15 bg-black/35 p-3">
                    <MirrorMark />
                  </div>
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-300">
                    Mirror Motion Engine
                  </p>
                </div>

                <div className="flex flex-col gap-4">
                  <h1 className="max-w-3xl text-4xl font-black tracking-[-0.03em] text-white sm:text-5xl lg:text-6xl">
                    Rainbow energy, black-stage focus, and feedback on every beat.
                  </h1>
                  <p className="max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
                    MirrorMe starts with the weekly dance captain workflow:
                    review recorded submissions, overlay pose landmarks, and
                    produce timestamped feedback that dancers can act on without
                    waiting for manual review.
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  {coreFlows.map((flow) => (
                    <div
                      key={flow}
                      className="rounded-2xl border border-white/15 bg-[#121527]/85 p-4 text-sm leading-6 text-slate-200 shadow-[0_10px_24px_rgba(10,12,25,0.45)]"
                    >
                      {flow}
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap gap-3">
                  <Link
                    href="/compare"
                    className="rounded-full bg-gradient-to-r from-[#ff4545] via-[#ffd84b] to-[#2f95ff] px-5 py-3 text-sm font-bold text-slate-950 shadow-[0_12px_26px_rgba(61,96,255,0.35)] transition hover:scale-[1.02]"
                  >
                    Start v1 upload flow
                  </Link>
                  <a
                    href="https://github.com/gbariana2/MirrorMe"
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full border border-white/25 bg-white/10 px-5 py-3 text-sm font-bold text-slate-100 transition hover:bg-white/20"
                  >
                    View repo
                  </a>
                </div>
              </div>

              <div className="rainbow-border rounded-[1.75rem] p-[1px]">
                <div className="h-full rounded-[calc(1.75rem-1px)] border border-white/10 bg-[#090c18]/95 p-6 text-slate-100">
                  <div className="mb-6 flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.24em] text-slate-400">
                        MVP Scope
                      </p>
                      <h2 className="mt-2 text-2xl font-extrabold">Week 6 target</h2>
                    </div>
                    <div className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs text-slate-200">
                      v1
                    </div>
                  </div>

                  <ul className="space-y-3 text-sm leading-6 text-slate-300">
                    <li>Reference video upload</li>
                    <li>Dancer video upload</li>
                    <li>MediaPipe pose overlays</li>
                    <li>Angle-based difference detection</li>
                    <li>Timestamped major/minor feedback report</li>
                  </ul>

                  <div className="mt-6 rounded-2xl border border-white/15 bg-white/5 p-4 text-sm leading-6 text-slate-300">
                    Biggest risk: noisy comparison logic. The first
                    implementation should favor explainable heuristics over
                    fragile ML-heavy automation.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-8 lg:grid-cols-[1fr_1.1fr]">
          <div className="rainbow-border rounded-[2rem] p-[1px]">
            <div className="rounded-[calc(2rem-1px)] border border-white/10 bg-[#0a0f1d]/92 p-6 sm:p-8">
              <div className="mb-6">
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#ff92c2]">
                  Build Strategy
                </p>
                <h2 className="mt-2 text-3xl font-extrabold tracking-[-0.02em] text-white">
                  Principles for the next four weeks
                </h2>
              </div>

              <div className="space-y-5">
                {principles.map((principle) => (
                  <div
                    key={principle.title}
                    className="rounded-2xl border border-white/15 bg-gradient-to-r from-[#171b33] to-[#1e1330] p-5"
                  >
                    <h3 className="text-lg font-extrabold text-white">
                      {principle.title}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-slate-300">
                      {principle.copy}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rainbow-border rounded-[2rem] p-[1px]">
            <div className="rounded-[calc(2rem-1px)] border border-white/10 bg-[#121015]/92 p-6 sm:p-8">
              <div className="mb-6">
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#7ec6ff]">
                  Delivery Plan
                </p>
                <h2 className="mt-2 text-3xl font-extrabold tracking-[-0.02em] text-white">
                  Weekly version milestones
                </h2>
              </div>

              <div className="space-y-4">
                {weekPlan.map((item) => (
                  <div
                    key={item.label}
                    className="grid gap-3 rounded-2xl border border-white/15 bg-[#1a1f35]/75 p-5 sm:grid-cols-[88px_1fr]"
                  >
                    <div>
                      <div className="text-sm font-bold uppercase tracking-[0.18em] text-[#ffd84b]">
                        {item.label}
                      </div>
                      <div className="mt-1 text-sm text-slate-400">
                        {item.timeframe}
                      </div>
                    </div>
                    <p className="text-sm leading-6 text-slate-200">{item.goal}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
