import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { confirmOperation } from "@/lib/operation-confirmation";

/** صنف موحّد لحقول الاختيار (select) في كل الشاشات. */
export const selectCls = "h-9 w-full rounded-lg border border-input bg-background px-2 text-sm";

/** مربّع لونيّ فاتح تُوضع داخله أيقونة الوحدة — نمط الأيقونات في النظام المرجعي. */
export const TILE_TONES = {
  blue: "bg-tile-blue text-tile-blue-ink",
  sky: "bg-tile-sky text-tile-sky-ink",
  teal: "bg-tile-teal text-tile-teal-ink",
  mint: "bg-tile-mint text-tile-mint-ink",
  lime: "bg-tile-lime text-tile-lime-ink",
  gold: "bg-tile-gold text-tile-gold-ink",
  rose: "bg-tile-rose text-tile-rose-ink",
  violet: "bg-tile-violet text-tile-violet-ink",
} as const;

export type TileTone = keyof typeof TILE_TONES;

const TILE_BOX = { sm: "size-8 rounded-lg", md: "size-10 rounded-xl", lg: "size-12 rounded-2xl" } as const;
const TILE_ICON = { sm: "size-4", md: "size-5", lg: "size-6" } as const;

/** أيقونة داخل مربّع لونيّ — تُستخدم في بطاقات الوحدات وأسطر القوائم. */
export function IconTile({
  icon: Icon,
  tone = "teal",
  size = "md",
  className,
}: {
  icon: LucideIcon;
  tone?: TileTone;
  size?: keyof typeof TILE_BOX;
  className?: string | undefined;
}) {
  return (
    <span className={cn("grid shrink-0 place-items-center", TILE_BOX[size], TILE_TONES[tone], className)}>
      <Icon className={TILE_ICON[size]} strokeWidth={1.9} />
    </span>
  );
}

/** صف البحث + زر الإجراء الرئيسي في مكان واحد: البحث يمينًا والزر يسارًا. */
export function Toolbar({
  search,
  action,
  className,
}: {
  search?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-4 flex items-center gap-2", className)}>
      {search && <div className="min-w-0 flex-1">{search}</div>}
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** أزرار التقسيم (تبويبات) — شريط أبيض واحد يطفو على الخلفية، والتبويب النشط مميّز. */
export function Segments<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
}: {
  options: readonly { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn("mb-3 grid gap-1 rounded-2xl border border-border/60 bg-card p-1 shadow-card", className)}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-xl px-2 py-2 text-sm font-medium transition-colors",
            value === o.value ? "bg-primary/10 text-primary" : "text-muted-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** بطاقة سطر في قائمة (عميل، حوالة، شيك…). */
export function ListItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <li className={cn("rounded-2xl border border-border/60 bg-card p-3 shadow-card", className)}>{children}</li>
  );
}

/** حالة فارغة موحّدة: أيقونة + سطر واضح + تلميح أو زر إجراء. */
export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  hint?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-dashed border-border bg-card px-4 py-8 text-center shadow-card",
        className,
      )}
    >
      {Icon && <Icon className="mx-auto size-6 text-muted-foreground" strokeWidth={1.6} />}
      <p className="mt-2 text-sm font-medium text-foreground">{title}</p>
      {hint && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{hint}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

/** حالة التحميل: هياكل رمادية بدل سطر «جارٍ التحميل». */
export function LoadingRows({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <ul className={cn("space-y-2", className)} aria-busy="true" aria-label="جارٍ التحميل">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="rounded-2xl border border-border/60 bg-card p-3 shadow-card">
          <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
          <div className="mt-2.5 h-3 w-2/3 animate-pulse rounded bg-muted" />
          <div className="mt-3 h-3 w-1/4 animate-pulse rounded bg-muted" />
        </li>
      ))}
    </ul>
  );
}

const NOTICE_TONES = {
  info: "border-border/60 bg-paper text-muted-foreground",
  warn: "border-gold/40 bg-gold/10 text-gold-foreground",
  danger: "border-destructive/40 bg-destructive/10 text-destructive",
  success: "border-positive/40 bg-positive/10 text-positive",
} as const;

/** تنبيه موحّد داخل الشاشة (تحذير سعر، خطأ حفظ، نجاح عملية). */
export function Notice({
  tone = "info",
  icon: Icon,
  children,
  className,
}: {
  tone?: keyof typeof NOTICE_TONES;
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "flex items-start gap-2 rounded-xl border px-3 py-2 text-xs font-medium leading-relaxed",
        NOTICE_TONES[tone],
        className,
      )}
    >
      {Icon && <Icon className="mt-0.5 size-3.5 shrink-0" />}
      <span className="min-w-0">{children}</span>
    </p>
  );
}

const PILL_TONES = {
  neutral: "border-border bg-muted text-muted-foreground",
  ok: "border-primary/40 bg-primary/10 text-primary",
  warn: "border-gold/40 bg-gold/15 text-gold-foreground",
  bad: "border-destructive/40 bg-destructive/10 text-destructive",
} as const;

/** حالة/وسم صغير أعلى السطر. */
export function StatusPill({
  tone = "neutral",
  children,
  className,
}: {
  tone?: keyof typeof PILL_TONES;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        PILL_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** حقل نموذج مع عنوان واضح فوق التحكم. */
export function Field({
  label,
  children,
  className,
}: {
  label: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  // نمط هولجن: العنوان صغير فوق الحد العلوي للحقل
  return (
    <label className={cn("relative grid pt-1.5", className)}>
      <span className="pointer-events-none absolute top-0 right-2.5 z-10 bg-card px-1 text-[10.5px] font-semibold leading-none text-foreground/80">{label}</span>
      <div className="[&_input]:h-11 [&_input]:rounded-md [&_input]:border-foreground/40 [&_select]:h-11 [&_select]:rounded-md [&_select]:border-foreground/40 [&_textarea]:rounded-md [&_textarea]:border-foreground/40">{children}</div>
    </label>
  );
}

/** بطاقة نموذج (إضافة/تعديل). */
export function FormCard({
  children,
  onSubmit,
  className,
  confirm = true,
}: {
  children: ReactNode;
  onSubmit: (e: React.FormEvent) => void;
  className?: string | undefined;
  confirm?: boolean;
}) {
  return (
    <form
      className={cn("mb-4 grid gap-3.5 rounded-xl border border-border bg-card p-3 shadow-card [&_button[type=submit]]:h-11 [&_button[type=submit]]:rounded-md [&_button[type=submit]]:border [&_button[type=submit]]:border-foreground/40 [&_button[type=submit]]:bg-muted [&_button[type=submit]]:font-bold [&_button[type=submit]]:text-foreground [&_button[type=submit]]:shadow-card", className)}
      onSubmit={(event) => {
        event.preventDefault();
        if (!confirm) { onSubmit(event); return; }
        const submitter = (event.nativeEvent as SubmitEvent).submitter;
        const label = submitter?.textContent?.trim() || "حفظ البيانات";
        confirmOperation(label, () => onSubmit(event));
      }}
    >
      {children}
    </form>
  );
}

/** عنوان قسم موحّد مع جهة يمين اختيارية. */
export function SectionCard({
  title,
  aside,
  children,
  className,
}: {
  title: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("mb-4 rounded-xl border border-border bg-card p-3 shadow-card", className)}>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold">{title}</h2>
        {aside && <span className="text-[11px] text-muted-foreground">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

/** جدول موحّد بنمط هولجن: رأس رمادي بأعمدة مفصولة وأسطر مخططة. */
export function DataTable({
  head,
  children,
  className,
}: {
  head: readonly ReactNode[];
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("overflow-x-auto rounded-md border border-border", className)}>
      <table className="w-full border-collapse text-[13px] [&_tbody_tr:nth-child(even)]:bg-muted/40 [&_td]:border-x [&_td]:border-border/60 [&_td]:px-1.5">
        <thead className="sticky top-0">
          <tr className="bg-muted text-[11px] text-foreground">
            {head.map((h, i) => (
              <th key={i} className="whitespace-nowrap border-x border-border px-1.5 py-2 text-start font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/** خلية جدول. money = أرقام مصطفّة، align = محاذاة. */
export function Td({
  children,
  align = "start",
  money,
  className,
  colSpan,
}: {
  children?: ReactNode;
  align?: "start" | "center" | "end";
  money?: boolean;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={cn(
        "border-b border-border/60 py-2",
        align === "center" && "text-center",
        align === "end" && "text-end",
        money && "ledger-figures",
        className,
      )}
    >
      {children}
    </td>
  );
}

/** سطر جدول. onClick اختياري لصفوف تُفتح بالنقر (مثل اختيار حوالة). */
export function Tr({ children, className, onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return <tr onClick={onClick} className={cn(className)}>{children}</tr>;
}
