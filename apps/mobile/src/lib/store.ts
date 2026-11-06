import { useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

/**
 * A value kept on the device that components follow with `useStored`. Reads are synchronous: the root layout waits
 * for `hydrate()` behind the splash screen, so a cached session, school or day renders on the first frame, before the
 * network says anything. Writes land in memory at once and go to storage behind it.
 *
 * `secure` keeps the value in the keychain / keystore (expo-secure-store) instead of AsyncStorage: for the device
 * token only, since the keychain is small and slow.
 */
type Entry = { key: string; secure: boolean; load: (raw: string | null) => void };

const registry = new Map<string, Entry>();
let hydrated = false;

async function read(e: Entry) {
  try {
    return e.secure ? await SecureStore.getItemAsync(e.key) : await AsyncStorage.getItem(e.key);
  } catch {
    return null;
  }
}

/** Loads every store from the device. Stores made after this load themselves (and update when they land). */
export async function hydrate() {
  await Promise.all([...registry.values()].map(async e => e.load(await read(e))));
  hydrated = true;
}

export function persisted<T>(key: string, fallback: T, opts: { secure?: boolean } = {}) {
  let value: T = fallback;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach(l => l());
  const secure = !!opts.secure;
  // A write before the value was read from storage wins over what storage says.
  let touched = false;

  const entry: Entry = {
    key,
    secure,
    load: raw => {
      if (touched || raw == null) return;
      try {
        value = JSON.parse(raw) as T;
        notify();
      } catch {
        // A corrupt entry: start from the fallback.
      }
    },
  };
  registry.set(key, entry);
  if (hydrated) void read(entry).then(entry.load);

  const get = () => value;

  const set = (next: T | ((prev: T) => T)) => {
    touched = true;
    value = typeof next === "function" ? (next as (prev: T) => T)(value) : next;
    notify();
    const gone = value === fallback || value == null;
    const raw = gone ? null : JSON.stringify(value);
    const write = secure
      ? raw == null
        ? SecureStore.deleteItemAsync(key)
        : SecureStore.setItemAsync(key, raw)
      : raw == null
        ? AsyncStorage.removeItem(key)
        : AsyncStorage.setItem(key, raw);
    // Storage full or blocked: the value still lives for this run of the app.
    write.catch(() => {});
  };

  const subscribe = (l: () => void) => {
    listeners.add(l);
    return () => void listeners.delete(l);
  };

  return { get, set, subscribe };
}

export type Store<T> = ReturnType<typeof persisted<T>>;

/**
 * A store's value, kept in step with it: `const token = useStored(tokenStore)`. A free function named like a hook on
 * purpose: the React Compiler only treats `useX(...)` calls as hooks, and would memoise a `store.use()` method call as a
 * plain value, reading the store once and never subscribing.
 */
export function useStored<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
