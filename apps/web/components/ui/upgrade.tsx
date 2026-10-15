import Link from "next/link";
import { Lock } from "lucide-react";
import { FEATURE_PLAN, PLAN_NAME, type Feature } from "@fl/core";
import { Card } from "@/components/ui/card";

/** Shown in place of a feature the farm's plan doesn't include. */
export function Upgrade({ feature, title }: { feature: Feature; title: string }) {
  const plan = PLAN_NAME[FEATURE_PLAN[feature]];
  return (
    <Card className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-cream-tint text-ink"><Lock size={20} /></span>
      <h3 className="mt-4 font-serif text-xl font-semibold text-ink">{title} Is on {plan}</h3>
      <Link href="/account#plan" className="mt-5 rounded-btn bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-deep">See Plans</Link>
    </Card>
  );
}
