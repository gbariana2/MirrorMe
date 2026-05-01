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

export default function Home() {
  return (
    <main className="phulkari-bg min-h-screen px-5 py-8 text-amber-950 sm:px-10 lg:px-16 lg:py-12">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <section className="relative overflow-hidden rounded-[2rem] border border-rose-700/25 bg-[#fffaf2]/85 shadow-[0_20px_70px_rgba(186,42,53,0.2)] backdrop-blur">
          <div className="phulkari-tile absolute -left-8 -top-8 h-36 w-36 rotate-6 rounded-3xl border border-rose-700/20 opacity-70" />
          <div className="phulkari-tile absolute -bottom-8 -right-8 h-36 w-36 -rotate-6 rounded-3xl border border-blue-700/20 opacity-65" />

          <div className="relative grid gap-8 px-6 py-8 sm:px-8 lg:grid-cols-[1.25fr_0.95fr] lg:px-12 lg:py-12">
            <div className="flex flex-col gap-6">
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center rounded-full border border-amber-900/20 bg-white/75 px-3 py-1 text-xs font-bold uppercase tracking-[0.22em] text-rose-900">
                  MirrorMe
                </span>
                <span className="text-sm font-medium text-rose-900/80">
                  AI-assisted choreography review
                </span>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/90 shadow-inner shadow-rose-500/20">
                  <span className="text-4xl font-black leading-none tracking-[-0.1em]">
                    <span className="inline-block text-[#ff5339]">M</span>
                    <span className="inline-block -scale-x-100 text-[#2f7dff]">M</span>
                  </span>
                </div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-900/70">
                  Mirror Motion Engine
                </p>
              </div>

              <div className="flex flex-col gap-4">
                <h1 className="max-w-3xl text-4xl font-black tracking-[-0.03em] text-rose-950 sm:text-5xl lg:text-6xl">
                  Bright feedback for every beat, step, and posture shift.
                </h1>
                <p className="max-w-2xl text-base leading-7 text-amber-900/90 sm:text-lg">
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
                    className="rounded-2xl border border-rose-900/15 bg-white/80 p-4 text-sm leading-6 text-amber-900 shadow-[0_6px_18px_rgba(189,58,58,0.1)]"
                  >
                    {flow}
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-3">
                <Link
                  href="/compare"
                  className="rounded-full bg-gradient-to-r from-[#ff4a43] via-[#ff8e1f] to-[#ffd447] px-5 py-3 text-sm font-bold text-rose-950 shadow-[0_10px_24px_rgba(255,94,64,0.35)] transition hover:scale-[1.02]"
                >
                  Start v1 upload flow
                </Link>
                <a
                  href="https://github.com/gbariana2/MirrorMe"
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-rose-800/20 bg-white/60 px-5 py-3 text-sm font-bold text-rose-900 transition hover:bg-white"
                >
                  View repo
                </a>
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-amber-200/80 bg-gradient-to-br from-[#ff4f90] via-[#ff8e1f] to-[#ffd447] p-[1px]">
              <div className="h-full rounded-[1.65rem] bg-[#471924]/90 p-6 text-amber-50">
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.24em] text-amber-200/80">
                      MVP Scope
                    </p>
                    <h2 className="mt-2 text-2xl font-extrabold">
                      Week 6 target
                    </h2>
                  </div>
                  <div className="rounded-full border border-amber-100/30 bg-white/10 px-3 py-1 text-xs text-amber-100">
                    v1
                  </div>
                </div>

                <ul className="space-y-3 text-sm leading-6 text-amber-50/95">
                  <li>Reference video upload</li>
                  <li>Dancer video upload</li>
                  <li>MediaPipe pose overlays</li>
                  <li>Angle-based difference detection</li>
                  <li>Timestamped major/minor feedback report</li>
                </ul>

                <div className="mt-6 rounded-2xl border border-amber-200/25 bg-black/20 p-4 text-sm leading-6 text-amber-100">
                  Biggest risk: noisy comparison logic. The first
                  implementation should favor explainable heuristics over
                  fragile ML-heavy automation.
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-8 lg:grid-cols-[1fr_1.1fr]">
          <div className="rounded-[2rem] border border-rose-700/25 bg-white/75 p-6 shadow-[0_16px_50px_rgba(168,48,94,0.16)] backdrop-blur sm:p-8">
            <div className="mb-6">
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-rose-700">
                Build Strategy
              </p>
              <h2 className="mt-2 text-3xl font-extrabold tracking-[-0.02em] text-rose-950">
                Principles for the next four weeks
              </h2>
            </div>

            <div className="space-y-5">
              {principles.map((principle) => (
                <div
                  key={principle.title}
                  className="rounded-2xl border border-rose-800/20 bg-gradient-to-r from-[#fff0da] to-[#ffe3ed] p-5"
                >
                  <h3 className="text-lg font-extrabold text-rose-950">
                    {principle.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-amber-950/90">
                    {principle.copy}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[2rem] border border-blue-700/20 bg-[#fff4d8]/85 p-6 shadow-[0_16px_50px_rgba(31,105,203,0.14)] sm:p-8">
            <div className="mb-6">
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-blue-700">
                Delivery Plan
              </p>
              <h2 className="mt-2 text-3xl font-extrabold tracking-[-0.02em] text-blue-950">
                Weekly version milestones
              </h2>
            </div>

            <div className="space-y-4">
              {weekPlan.map((item) => (
                <div
                  key={item.label}
                  className="grid gap-3 rounded-2xl border border-blue-900/15 bg-white/90 p-5 sm:grid-cols-[88px_1fr]"
                >
                  <div>
                    <div className="text-sm font-bold uppercase tracking-[0.18em] text-blue-700">
                      {item.label}
                    </div>
                    <div className="mt-1 text-sm text-blue-900/65">
                      {item.timeframe}
                    </div>
                  </div>
                  <p className="text-sm leading-6 text-amber-950/90">
                    {item.goal}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
