import { redirect } from "next/navigation";
import { getCurrentFarm } from "@/lib/session";
import { LoginForm } from "./login-form";

// Server component: if there's already a VALID session (verified, not just a
// cookie present), skip the form and go straight to the dashboard. This renders
// standalone — the app shell/sidebar only mounts for authenticated routes.
export default async function LoginPage({ searchParams }: { searchParams: { next?: string; email?: string } }) {
  const next = searchParams.next?.startsWith("/") && !searchParams.next.startsWith("//") ? searchParams.next : undefined;
  if (await getCurrentFarm()) redirect(next ?? "/");
  return <LoginForm next={next} email={searchParams.email?.slice(0, 200)} />;
}
