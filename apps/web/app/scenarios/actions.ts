"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@fl/db";
import { getDemoFarmId, getCurrentRole, canWrite } from "@/lib/data";

const n = (v: FormDataEntryValue | null) => Number(v ?? 0) || 0;

/** Add a question to the farm's scenario list from a template. */
export async function addLever(form: FormData) {
  const farmId = await getDemoFarmId();
  if (!canWrite(await getCurrentRole())) return;
  const template = String(form.get("template"));
  const year = n(form.get("year"));
  let params: Record<string, unknown>, question: string, driver: string, change: string;
  switch (template) {
    case "price_shock": {
      const line = String(form.get("line"));
      const accounts = (await prisma.account.findMany({ where: { farmId, section: "REV", statementLine: line } })).map((a) => a.code);
      params = { accounts, year, pct: n(form.get("pct")) / 100, label: `${year} ${line.toLowerCase()}` };
      question = `What if ${line.toLowerCase()} prices move ${n(form.get("pct"))}%?`; driver = `${line} (${year})`; change = `${n(form.get("pct"))}%`; break;
    }
    case "cost_shock": {
      const line = String(form.get("line"));
      const accounts = (await prisma.account.findMany({ where: { farmId, section: { in: ["COP", "OVH"] }, statementLine: line } })).map((a) => a.code);
      params = { accounts, year, pct: n(form.get("pct")) / 100, label: `${year} ${line.toLowerCase()}` };
      question = `What if ${line.toLowerCase()} costs move ${n(form.get("pct"))}%?`; driver = `${line} spend (${year})`; change = `${n(form.get("pct"))}%`; break;
    }
    case "equipment_purchase":
      params = { price: n(form.get("price")), down: n(form.get("down")), ratePct: n(form.get("ratePct")), years: n(form.get("years")), marginYear: year };
      question = `Can I afford a $${n(form.get("price")).toLocaleString()} purchase?`; driver = `Repayment margin (${year})`; change = `${n(form.get("years"))}-yr note at ${n(form.get("ratePct"))}%`; break;
    case "add_units":
      params = { units: n(form.get("units")), marginPerUnit: n(form.get("margin")), upkeepPerUnit: n(form.get("upkeep")), label: String(form.get("label") || "units") };
      question = `Should I add ${n(form.get("units"))} ${String(form.get("label") || "units")}?`; driver = "Units"; change = `+${n(form.get("units"))}`; break;
    default:
      params = { impact: n(form.get("impact")), basis: String(form.get("basis") ?? "") };
      question = String(form.get("question") || "Owner estimate"); driver = "Owner estimate"; change = "";
  }
  const lever = await prisma.scenarioLever.create({ data: { farmId, question, driver, scenarioChange: change, template, params: params as object } });
  await prisma.auditLog.create({ data: { farmId, action: "create", entity: "ScenarioLever", entityId: lever.id, after: { template, params: params as object } } });
  revalidatePath("/scenarios");
}

export async function removeLever(form: FormData) {
  const farmId = await getDemoFarmId();
  if (!canWrite(await getCurrentRole())) return;
  const id = String(form.get("id"));
  const lever = await prisma.scenarioLever.findFirst({ where: { id, farmId } });
  if (!lever) return;
  await prisma.scenarioLever.delete({ where: { id } });
  await prisma.auditLog.create({ data: { farmId, action: "delete", entity: "ScenarioLever", entityId: id, before: { question: lever.question } } });
  revalidatePath("/scenarios");
}
