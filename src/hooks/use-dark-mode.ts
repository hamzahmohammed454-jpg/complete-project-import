import { useCallback, useEffect, useState } from "react";

const KEY = "app-theme";

/** الوضع الليلي: يبدّل صنف .dark على الجذر ويحفظ الاختيار في المتصفح. */
export function useDarkMode() {
  const [dark, setDark] = useState(
    () => typeof window !== "undefined" && window.localStorage.getItem(KEY) === "dark",
  );

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    window.localStorage.setItem(KEY, dark ? "dark" : "light");
  }, [dark]);

  const toggle = useCallback(() => setDark((v) => !v), []);
  return { dark, toggle };
}
