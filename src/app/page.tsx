import Link from "next/link";
import { Show, SignInButton, UserButton } from "@clerk/nextjs";
import { BrandMark } from "@/components/brand-mark";

const captainActions = [
  "Create a team and share join code with dancers.",
  "Upload assignment reference videos and set deadlines.",
  "Track who submitted and review scored feedback.",
];

const dancerActions = [
  "Open captain invite link or enter the team join code.",
  "Open assigned reference choreography for the week.",
  "Upload your submission and view timestamped corrections.",
];

export default function Home() {
  return (
    <main className="phulkari-bg min-h-screen px-5 py-8 text-slate-900 sm:px-10 lg:px-16 lg:py-12">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <section className="rounded-[2rem] border border-[#e8dccf] soft-panel p-6 sm:p-8 lg:p-10">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="max-w-3xl">
              <BrandMark className="mb-4" />
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#d64f72]">
                Computer Vision Feedback
              </p>
              <h1 className="mt-3 text-4xl font-black tracking-[-0.03em] text-slate-900 sm:text-5xl lg:text-6xl">
                Assignment-driven dance feedback for teams and solo practice.
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-slate-700 sm:text-lg">
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
                    className="rounded-full bg-[#ff7f5f] px-5 py-3 text-sm font-bold text-slate-950 shadow-[0_10px_20px_rgba(47,168,255,0.4)] transition hover:bg-[#ff997f]"
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
              className="rounded-2xl border border-[#e8dccf] bg-[#fffaf5]/85 p-5 text-left transition hover:border-[#8fd4ff]/55 hover:bg-[#fff1e7]"
            >
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Solo Mode</p>
              <p className="mt-2 text-xl font-bold text-slate-900">Compare Now</p>
              <p className="mt-2 text-sm leading-6 text-slate-700">
                Upload reference and submission in one flow, then run analysis immediately.
              </p>
            </Link>

            <Link
              href="/captain"
              className="rounded-2xl border border-[#e8dccf] bg-[#fffaf5]/85 p-5 text-left transition hover:border-[#8fd4ff]/55 hover:bg-[#fff1e7]"
            >
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Captain Mode</p>
              <p className="mt-2 text-xl font-bold text-slate-900">Run Team Assignments</p>
              <p className="mt-2 text-sm leading-6 text-slate-700">
                Create team, publish choreography assignments, and review each dancer submission.
              </p>
            </Link>

            <Link
              href="/dancer"
              className="rounded-2xl border border-[#e8dccf] bg-[#fffaf5]/85 p-5 text-left transition hover:border-[#8fd4ff]/55 hover:bg-[#fff1e7]"
            >
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Dancer Mode</p>
              <p className="mt-2 text-xl font-bold text-slate-900">Submit Before Deadline</p>
              <p className="mt-2 text-sm leading-6 text-slate-700">
                Join via invite link, open your assignment, and receive targeted corrections.
              </p>
            </Link>
          </div>
        </section>

        <section className="grid gap-8 lg:grid-cols-2">
          <article className="rounded-[2rem] border border-[#e8dccf] soft-panel p-6 sm:p-8">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#d64f72]">
              Captain Workflow
            </p>
            <ul className="mt-5 space-y-3 text-sm leading-7 text-slate-700">
              {captainActions.map((item) => (
                <li key={item} className="rounded-xl border border-[#e8dccf] bg-[#fff6ef] p-4">
                  {item}
                </li>
              ))}
            </ul>
          </article>

          <article className="rounded-[2rem] border border-[#e8dccf] soft-panel p-6 sm:p-8">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#d64f72]">
              Dancer Workflow
            </p>
            <ul className="mt-5 space-y-3 text-sm leading-7 text-slate-700">
              {dancerActions.map((item) => (
                <li key={item} className="rounded-xl border border-[#e8dccf] bg-[#fff6ef] p-4">
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
