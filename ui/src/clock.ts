import { useSyncExternalStore } from "react";

type ClockListener = () => void;

const listeners = new Set<ClockListener>();
let interval: ReturnType<typeof setInterval> | undefined;
let nowSeconds = readNowSeconds();

function readNowSeconds(): number {
  return Math.floor(Date.now() / 1_000);
}

function tick(): void {
  const nextNowSeconds = readNowSeconds();
  if (nextNowSeconds === nowSeconds) return;

  nowSeconds = nextNowSeconds;
  for (const listener of listeners) listener();
}

function subscribe(listener: ClockListener): () => void {
  listeners.add(listener);

  if (listeners.size === 1) {
    nowSeconds = readNowSeconds();
    interval = setInterval(tick, 1_000);
  }

  return () => {
    listeners.delete(listener);
    if (listeners.size > 0 || interval === undefined) return;

    clearInterval(interval);
    interval = undefined;
  };
}

function getSnapshot(): number {
  if (interval === undefined) nowSeconds = readNowSeconds();
  return nowSeconds;
}

export function useNowSeconds(): number {
  return useSyncExternalStore(subscribe, getSnapshot);
}
