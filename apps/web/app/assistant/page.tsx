import { AssistantView } from "@/components/assistant-view";
import { Sparkles } from "lucide-react";

export default function AssistantPage() {
  return (
    <>
      <div className="mb-8">
        <h2 className="flex items-center gap-2 font-serif text-4xl font-bold text-primary"><Sparkles size={28} className="text-rust" /> AI Farm Assistant</h2>
        <p className="mt-1 text-muted">Chat, log transactions with plain English, or scan receipts.</p>
      </div>
      <AssistantView />
    </>
  );
}
