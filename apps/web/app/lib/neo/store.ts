import { useSyncExternalStore } from "react";

/**
 * A value in localStorage that components can subscribe to, kept in step across tabs. Reads are synchronous, so a
 * cached session or school renders on the first frame, before the network says anything.
 */
export function persisted<T>(key: string, fallback: T) {
  let value: T = fallback;
  let loaded = false;
  const listeners = new Set<() => void>();

  const load = () => {
    if (loaded || typeof window === "undefined") return;
    loaded = true;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw != null) value = JSON.parse(raw) as T;
    } catch {
      // Private mode or a corrupt entry: start from the fallback.
    }
    window.addEventListener("storage", e => {
      if (e.key !== key) return;
      try {
        value = e.newValue == null ? fallback : (JSON.parse(e.newValue) as T);
      } catch {
        value = fallback;
      }
      listeners.forEach(l => l());
    });
  };

  const get = () => {
    load();
    return value;
  };

  const set = (next: T | ((prev: T) => T)) => {
    load();
    value = typeof next === "function" ? (next as (prev: T) => T)(value) : next;
    try {
      if (value === fallback || value == null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage full or blocked: the value still lives for this tab.
    }
    listeners.forEach(l => l());
  };

  const subscribe = (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  };

  const use = () => useSyncExternalStore(subscribe, get, () => fallback);

  return { get, set, use };
}
