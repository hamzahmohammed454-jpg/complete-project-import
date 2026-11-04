import { useEffect, useState } from "react";
import { getOutbox, getCacheMeta, subscribeOutbox, type CacheMeta } from "@/lib/offline/network";
import type { OutboxItem } from "@/lib/offline/outbox-core";

export function useOfflineStatus() {
  const [online, setOnline] = useState(true);
  const [items, setItems] = useState<OutboxItem[]>([]);
  const [cache, setCache] = useState<CacheMeta>({ lastReadAt: null, lastSyncAt: null, cachedReads: 0 });
  useEffect(() => {
    const update = () => {
      setOnline(navigator.onLine);
      setItems([...getOutbox()]);
      setCache({ ...getCacheMeta() });
    };
    update();
    const off = subscribeOutbox(update);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      off();
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return { online, items, cache, failed: items.filter((i) => i.status === "failed").length };
}
