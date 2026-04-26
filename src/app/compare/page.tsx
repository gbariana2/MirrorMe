import { CompareForm } from "@/components/compare-form";

export default function ComparePage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(246,186,78,0.25),_transparent_32%),linear-gradient(180deg,_#fff9ef_0%,_#f3efe6_46%,_#e6e1d7_100%)] px-6 py-8 text-stone-900 sm:px-10 lg:px-16">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <CompareForm />
      </div>
    </main>
  );
}
