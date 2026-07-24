import type { EventTheme } from "@prisma/client";

export const THEME_STYLES: Record<EventTheme, { bg: string; accent: string; heading: string }> = {
  CLASSIC: {
    bg: "bg-gradient-to-b from-neutral-100 to-white dark:from-neutral-900 dark:to-neutral-950",
    accent: "bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900",
    heading: "font-serif",
  },
  MODERN: {
    bg: "bg-gradient-to-br from-brand-600 via-brand-500 to-indigo-500 text-white",
    accent: "bg-white text-brand-700 hover:bg-brand-50",
    heading: "font-sans tracking-tight",
  },
  PLAYFUL: {
    bg: "bg-gradient-to-br from-amber-200 via-pink-200 to-sky-200 dark:from-amber-900 dark:via-pink-900 dark:to-sky-900",
    accent: "bg-pink-600 text-white hover:bg-pink-700",
    heading: "font-sans",
  },
  ELEGANT: {
    bg: "bg-gradient-to-b from-neutral-950 to-neutral-900 text-white",
    accent: "bg-amber-400 text-neutral-900 hover:bg-amber-300",
    heading: "font-serif tracking-wide",
  },
};
