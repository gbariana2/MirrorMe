import Link from "next/link";
import { Show, SignInButton, UserButton } from "@clerk/nextjs";

const captainActions = [
  "Create a team and share join code with dancers.",
  "Upload assignment reference videos and set deadlines.",
  "Track who submitted and review scored feedback.",
];

const dancerActions = [
  "Join your team with the captain's join code.",
  "Open assigned reference choreography for the week.",
  "Upload your submission and view timestamped corrections.",
];

export default function Home() {
  return (
    <main className="phulkari-bg min-h-screen px-5 py-8 text-slate-100 sm:px-10 lg:px-16 lg:py-12">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <section className="rounded-[2rem] border border-white/15 soft-panel p-6 sm:p-8 lg:p-10">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#8fd4ff]">
                MirrorMe Platform
              </p>
              <h1 className="mt-3 bg-gradient-to-r from-[#b8e4ff] via-[#7ecbff] to-[#37adff] bg-clip-text text-4xl font-black tracking-[-0.03em] text-transparent sm:text-5xl lg:text-6xl">
                Assignment-driven dance feedback for teams and solo practice.
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
                Captains assign a reference video and deadline. Dancers submit before cutoff and
                get similarity scoring, improvement notes, and exact timestamps where movement
                drifts from the reference.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Show when="signed-in">
                <UserButton />
              </Show>
              <Show when="signed-out">
                <SignInButton mode="modal">
                  <button
                    type="button"
                    className="rounded-full bg-[#2fa8ff] px-5 py-3 text-sm font-bold text-slate-950 shadow-[0_10px_20px_rgba(47,168,255,0.4)] transition hover:bg-[#66c2ff]"
                  >
                    Sign In
                  </button>
                </SignInButton>
              </Show>
            </div>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <Link
              href="/compare"
              className="rounded-2xl border border-white/15 bg-[#121527]/85 p-5 text-left transition hover:border-[#8fd4ff]/55 hover:bg-[#171c2f]"
            >
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Solo Mode</p>
              <p className="mt-2 text-xl font-bold text-white">Compare Now</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Upload reference and submission in one flow, then run analysis immediately.
              </p>
            </Link>

            <article className="rounded-2xl border border-white/15 bg-[#121527]/85 p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Captain Mode</p>
              <p className="mt-2 text-xl font-bold text-white">Run Team Assignments</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Create team, publish choreography assignments, and review each dancer submission.
              </p>
            </article>

            <article className="rounded-2xl border border-white/15 bg-[#121527]/85 p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Dancer Mode</p>
              <p className="mt-2 text-xl font-bold text-white">Submit Before Deadline</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Open your assignment, upload recording, and receive targeted corrections.
              </p>
            </article>
          </div>
        </section>

        <section className="grid gap-8 lg:grid-cols-2">
          <article className="rounded-[2rem] border border-white/12 soft-panel p-6 sm:p-8">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#8fd4ff]">
              Captain Workflow
            </p>
            <ul className="mt-5 space-y-3 text-sm leading-7 text-slate-300">
              {captainActions.map((item) => (
                <li key={item} className="rounded-xl border border-white/12 bg-[#161922] p-4">
                  {item}
                </li>
              ))}
            </ul>
          </article>

          <article className="rounded-[2rem] border border-white/12 soft-panel p-6 sm:p-8">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#8fd4ff]">
              Dancer Workflow
            </p>
            <ul className="mt-5 space-y-3 text-sm leading-7 text-slate-300">
              {dancerActions.map((item) => (
                <li key={item} className="rounded-xl border border-white/12 bg-[#161922] p-4">
                  {item}
                </li>
              ))}
            </ul>
          </article>
        </section>
      </div>
    </main>
  );
}
