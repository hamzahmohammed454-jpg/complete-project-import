// Offline replacement of assistant.functions.ts: the AI assistant needs internet.
export async function askAssistant(_: { data: { messages: { role: "user" | "assistant"; content: string }[] } }) {
  return { error: "المساعد الآلي يحتاج الإنترنت وغير متاح في نسخة أبو الياس المحلية." };
}
