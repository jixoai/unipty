import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export type BackendId = "node-pty" | "bun" | "deno-sigma__pty-ffi";

export const BACKENDS: ReadonlyArray<{
  id: BackendId;
  label: string;
  runtime: "node" | "bun" | "deno";
  substrate: string;
}> = [
  {
    id: "node-pty",
    label: "Node",
    runtime: "node",
    substrate: "node-pty via @lydell/node-pty",
  },
  {
    id: "bun",
    label: "Bun",
    runtime: "bun",
    substrate: "runtime-native Bun.Terminal",
  },
  {
    id: "deno-sigma__pty-ffi",
    label: "Deno",
    runtime: "deno",
    substrate: "@sigma/pty-ffi over Rust portable-pty",
  },
];
