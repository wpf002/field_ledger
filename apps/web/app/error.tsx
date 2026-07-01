"use client";
import { useEffect } from "react";
import { TriangleAlert, RotateCw } from "lucide-react";

/** Root error boundary — catches render/data errors in any route segment and
 *  offers a retry instead of a blank screen. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Surface for local debugging; a real deploy would forward to a logger.
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#F3E3E0] text-negative"><TriangleAlert size={26} /></span>
      <h2 className="mt-5 font-serif text-2xl font-semibold text-ink">Something went wrong</h2>
      <p className="mt-2 max-w-md text-sm text-muted">We hit an unexpected error loading this page. Your data is safe — try again, and if it keeps happening, reload the app.</p>
      <button onClick={reset} className="mt-6 inline-flex items-center gap-2 rounded-btn bg-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-primary-deep">
        <RotateCw size={15} /> Try again
      </button>
    </div>
  );
}
