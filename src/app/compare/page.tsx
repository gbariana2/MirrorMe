import { CompareForm } from "@/components/compare-form";

export default function ComparePage() {
  return (
    <main className="phulkari-bg min-h-screen px-6 py-8 text-slate-100 sm:px-10 lg:px-16">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <CompareForm />
      </div>
    </main>
  );
}
