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
    copy:
      "Treat dance as the proving ground and avoid live webcam analysis, multi-user auth, or team views until the core comparison loop is stable.",
  },
  {
    title: "Make feedback inspectable",
    copy:
      "Every flagged issue should point to a timestamp, a body segment, and a measurable difference so the output is not a black-box score.",
  },
  {
    title: "Ship weekly",
    copy:
      "Each version needs visible progress in the public repo, not research notes. A thin vertical slice beats an unfinished ambitious branch.",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(246,186,78,0.25),_transparent_32%),linear-gradient(180deg,_#fff9ef_0%,_#f3efe6_46%,_#e6e1d7_100%)] px-6 py-8 text-stone-900 sm:px-10 lg:px-16">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <section className="overflow-hidden rounded-[2rem] border border-stone-900/10 bg-white/75 shadow-[0_24px_80px_rgba(59,38,16,0.12)] backdrop-blur">
          <div className="grid gap-8 px-6 py-8 sm:px-8 lg:grid-cols-[1.3fr_0.9fr] lg:px-12 lg:py-12">
            <div className="flex flex-col gap-6">
              <div className="flex items-center gap-3">
                <span className="rounded-full border border-stone-900/15 bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-950">
                  MirrorMe
                </span>
                <span className="text-sm text-stone-600">
                  AI-assisted choreography review
                </span>
              </div>

              <div className="flex flex-col gap-4">
                <h1 className="max-w-3xl text-4xl font-semibold tracking-[-0.04em] text-stone-950 sm:text-5xl lg:text-6xl">
                  Compare movement against a reference and pinpoint where form
                  drifts.
                </h1>
                <p className="max-w-2xl text-base leading-7 text-stone-700 sm:text-lg">
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
                    className="rounded-2xl border border-stone-900/10 bg-stone-50/80 p-4 text-sm leading-6 text-stone-700"
                  >
                    {flow}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[1.75rem] bg-stone-950 p-6 text-stone-100">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-amber-200/80">
                    MVP Scope
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold">Week 6 target</h2>
                </div>
                <div className="rounded-full border border-white/15 px-3 py-1 text-xs text-stone-300">
                  v1
                </div>
              </div>

              <ul className="space-y-3 text-sm leading-6 text-stone-300">
                <li>Reference video upload</li>
                <li>Dancer video upload</li>
                <li>MediaPipe pose overlays</li>
                <li>Angle-based difference detection</li>
                <li>Timestamped major/minor feedback report</li>
              </ul>

              <div className="mt-6 rounded-2xl bg-white/6 p-4 text-sm leading-6 text-stone-300">
                Biggest risk: noisy comparison logic. The first implementation
                should favor explainable heuristics over fragile ML-heavy
                automation.
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-8 lg:grid-cols-[1fr_1.1fr]">
          <div className="rounded-[2rem] border border-stone-900/10 bg-white/70 p-6 shadow-[0_20px_60px_rgba(59,38,16,0.08)] backdrop-blur sm:p-8">
            <div className="mb-6">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                Build Strategy
              </p>
              <h2 className="mt-2 text-3xl font-semibold tracking-[-0.03em]">
                Principles for the next four weeks
              </h2>
            </div>

            <div className="space-y-5">
              {principles.map((principle) => (
                <div
                  key={principle.title}
                  className="rounded-2xl border border-stone-900/10 bg-stone-50/80 p-5"
                >
                  <h3 className="text-lg font-semibold text-stone-950">
                    {principle.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-stone-700">
                    {principle.copy}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[2rem] border border-stone-900/10 bg-[#fffdf8]/85 p-6 shadow-[0_20px_60px_rgba(59,38,16,0.08)] sm:p-8">
            <div className="mb-6">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                Delivery Plan
              </p>
              <h2 className="mt-2 text-3xl font-semibold tracking-[-0.03em]">
                Weekly version milestones
              </h2>
            </div>

            <div className="space-y-4">
              {weekPlan.map((item) => (
                <div
                  key={item.label}
                  className="grid gap-3 rounded-2xl border border-stone-900/10 bg-white p-5 sm:grid-cols-[88px_1fr]"
                >
                  <div>
                    <div className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-700">
                      {item.label}
                    </div>
                    <div className="mt-1 text-sm text-stone-500">
                      {item.timeframe}
                    </div>
                  </div>
                  <p className="text-sm leading-6 text-stone-700">
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
