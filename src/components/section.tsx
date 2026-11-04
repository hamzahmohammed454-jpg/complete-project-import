export function SectionIntro({ title, subtitle }: { title: string; subtitle: string }) {
  // نمط هولجن: العنوان يظهر في شريط الرأس فقط
  void title; void subtitle;
  return null;
  return (
    <div className="mb-5 border-b border-border/70 pb-3">
      <h1 className="display text-xl font-bold tracking-tight">{title}</h1>
      <div className="mt-1.5 h-1 w-8 rounded-full bg-gold" aria-hidden />
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{subtitle}</p>
    </div>
  );
}

export function PendingNote({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-3 text-xs leading-relaxed text-muted-foreground shadow-card">
      {text}
    </div>
  );
}
