import clsx from "clsx";
export function PrimaryButton({ children, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...props} className={clsx("inline-flex items-center gap-2 rounded-btn bg-primary px-4 py-2.5 text-white text-sm font-medium hover:bg-primary-deep transition-colors", className)}>
      {children}
    </button>
  );
}
