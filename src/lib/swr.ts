"use client";
import { useEffect, useState } from "react";

// Tiny stale-while-revalidate cache shared across client-side navigations.
// First visit: fetch (caller shows a skeleton). Later visits within the session:
// return the cached value INSTANTLY, then refresh in the background — so switching
// tabs feels immediate instead of showing a loading spinner every time.
const cache = new Map<string, any>();
const subs = new Map<string, Set<() => void>>();

function notify(url: string) {
  subs.get(url)?.forEach((fn) => fn());
}

async function revalidate(url: string) {
  try {
    const r = await fetch(url, { cache: "no-store" });
    const j = await r.json();
    cache.set(url, j);
    notify(url);
  } catch {
    /* keep previous cached value */
  }
}

/** Warm the cache ahead of navigation (e.g. from the home screen). */
export function prefetch(url: string | null | undefined) {
  if (!url) return;
  if (!cache.has(url)) revalidate(url);
}

export function useCachedFetch<T = any>(url: string | null): { data: T | undefined; loading: boolean } {
  const [, force] = useState(0);
  const data = url ? (cache.get(url) as T | undefined) : undefined;

  useEffect(() => {
    if (!url) return;
    const rerender = () => force((n) => n + 1);
    let set = subs.get(url);
    if (!set) { set = new Set(); subs.set(url, set); }
    set.add(rerender);
    revalidate(url); // refresh on mount (background if we already have data)
    return () => { set!.delete(rerender); };
  }, [url]);

  return { data, loading: data === undefined };
}
