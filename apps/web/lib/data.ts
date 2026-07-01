import { redirect } from "next/navigation";
import { getCurrentFarm } from "./session";

/**
 * Server-side read layer. `getDemoFarm`/`getDemoFarmId` now resolve the current
 * user's selected farm from the session (Phase 8). Unauthenticated requests
 * redirect to /login (the name is kept so pages don't need to change).
 */
export async function getDemoFarm() {
  const c = await getCurrentFarm();
  if (!c) redirect("/login");
  return c.farm;
}

export async function getDemoFarmId() {
  return (await getDemoFarm()).id;
}

/** Current membership role for the selected farm (OWNER/ADMIN/MEMBER/VIEWER). */
export async function getCurrentRole() {
  const c = await getCurrentFarm();
  return c?.role ?? "VIEWER";
}
export const canWrite = (role: string) => role !== "VIEWER";
