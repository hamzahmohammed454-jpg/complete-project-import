// Phone printing for «أبو الياس»: Android's WebView ignores window.print(), so
// every print button instead renders the visible page (minus print:hidden
// controls) to an A4 PDF and hands it to Android's share sheet, from which the
// user can print, save to Files or send it on WhatsApp.
import { Capacitor } from "@capacitor/core";
import { downloadBlob } from "@/lib/download";

let busy = false;

function pdfName() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const title = (document.title || "abu-elyas").split("|")[0]!.trim().replace(/[\\/:*?"<>|\s]+/g, "-");
  return `${title}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.pdf`;
}

/** Picks the printable area: a paper sheet/voucher if the screen has one, otherwise the main content. */
function target(): HTMLElement {
  // Same areas the paper print stylesheet keeps (.voucher / .printable), first one actually on screen.
  const visible = (el: HTMLElement) => el.offsetParent !== null || el.getClientRects().length > 0;
  const sheet = [...document.querySelectorAll<HTMLElement>("[data-print-area], .voucher, .printable")].find(visible);
  return sheet ?? document.querySelector<HTMLElement>("main") ?? document.body;
}

export async function makePagePdf(): Promise<Blob> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas-pro"), import("jspdf")]);
  const el = target();
  const canvas = await html2canvas(el, {
    scale: 2,
    backgroundColor: "#ffffff",
    useCORS: true,
    windowWidth: Math.max(el.scrollWidth, 800),
    // Lay the copy out at paper width so wide tables are not cut off at the phone's edge.
    onclone: (_doc, copy) => {
      copy.style.width = "760px";
      copy.style.maxWidth = "none";
      copy.querySelectorAll<HTMLElement>(".overflow-x-auto, .overflow-hidden").forEach((n) => { n.style.overflow = "visible"; });
      copy.querySelectorAll<HTMLElement>(".print\\:block").forEach((n) => { n.style.display = "block"; });
    },
    ignoreElements: (n) => n instanceof HTMLElement && (n.classList.contains("print:hidden") || n.classList.contains("no-print") || n.dataset["printHide"] !== undefined),
  });
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageW = 210, pageH = 297, margin = 8;
  const w = pageW - margin * 2;
  const sliceH = Math.floor((canvas.width * (pageH - margin * 2)) / w);
  for (let y = 0, page = 0; y < canvas.height; y += sliceH, page++) {
    const h = Math.min(sliceH, canvas.height - y);
    const part = document.createElement("canvas");
    part.width = canvas.width; part.height = h;
    part.getContext("2d")!.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
    if (page) pdf.addPage();
    pdf.addImage(part.toDataURL("image/jpeg", 0.92), "JPEG", margin, margin, w, (h * w) / canvas.width);
  }
  return pdf.output("blob");
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** Saves a file into the app's cache and opens Android's share sheet (print / Files / WhatsApp). */
export async function shareFile(blob: Blob, name: string, title: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([import("@capacitor/filesystem"), import("@capacitor/share")]);
    const { uri } = await Filesystem.writeFile({ path: name, data: await toBase64(blob), directory: Directory.Cache });
    await Share.share({ title, files: [uri], dialogTitle: title });
    return;
  }
  downloadBlob(blob, name);
}

export async function printToPdf(): Promise<void> {
  if (busy) return;
  busy = true;
  const note = document.createElement("div");
  note.textContent = "جارٍ تجهيز ملف PDF…";
  note.setAttribute("data-print-hide", "");
  note.style.cssText = "position:fixed;inset-inline:0;bottom:24px;margin:auto;width:max-content;padding:10px 18px;border-radius:12px;background:#111;color:#fff;font-size:14px;z-index:99999";
  document.body.appendChild(note);
  try {
    await shareFile(await makePagePdf(), pdfName(), "طباعة / حفظ PDF");
  } catch (e) {
    if (!(e instanceof Error && /cancel/i.test(e.message))) alert(e instanceof Error ? e.message : "تعذّر إنشاء ملف PDF");
  } finally {
    note.remove();
    busy = false;
  }
}

/** Replaces window.print for the whole phone app, so every existing print button produces a PDF. */
export function installPdfPrint() {
  window.print = () => { void printToPdf(); };
}
