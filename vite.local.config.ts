// Build of the offline Android app «أبو الياس»: a static single-page bundle
// with the phone database inside. It never touches the published cloud site.
//   bunx vite build --config vite.local.config.ts   (output: dist/client)
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { fileURLToPath } from "node:url";

const src = (p: string) => fileURLToPath(new URL(`./src/${p}`, import.meta.url));

/** Shop name, emblem and default notice colour of «أبو الياس». */
function abuElyasBrand() {
  return {
    name: "abu-elyas-brand",
    enforce: "pre" as const,
    transform(code: string, id: string) {
      const file = id.split("?")[0];
      if (!/\/src\/.*\.(tsx?|jsx?)$/.test(file) || file.includes("/src/lib/local-db/")) return null;
      let out = code
        .replaceAll("ابو طه للصرافة والتحويلات المالية", "أبو الياس للصرافة والتحويلات المالية")
        .replaceAll("ابو طه", "أبو الياس")
        .replaceAll("أبو طه", "أبو الياس")
        .replaceAll("Abu Taha Exchange", "Abu Elyas Exchange");
      if (file.endsWith("/src/lib/app-prefs.ts")) out = out.replace('voucherColor: ""', 'voucherColor: "#7a1f2b"').replace('voucherShade: 0', "voucherShade: 12");
      return out === code ? null : { code: out, map: null };
    },
  };
}

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
    spa: { enabled: true, prerender: { outputPath: "/index.html", crawlLinks: false } },
  },
  vite: {
    define: { "import.meta.env.VITE_LOCAL_MODE": JSON.stringify("true") },
    resolve: {
      alias: [
        { find: /^@\/lib\/local-mode$/, replacement: src("lib/local-db/local-mode.tsx") },
        { find: /^@\/lib\/setup\.functions$/, replacement: src("lib/local-db/setup.local.ts") },
        { find: /^@\/lib\/staff\.functions$/, replacement: src("lib/local-db/staff.local.ts") },
        { find: /^@\/lib\/assistant\.functions$/, replacement: src("lib/local-db/assistant.local.ts") },
        { find: /^@\/assets\/abu-taha-emblem[^/]*\.png$/, replacement: src("assets/abu-elyas-emblem.png") },
      ],
    },
    optimizeDeps: { exclude: ["@electric-sql/pglite"] },
    plugins: [abuElyasBrand()],
  },
});
