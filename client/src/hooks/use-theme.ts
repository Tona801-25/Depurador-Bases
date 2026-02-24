// client/src/hooks/use-theme.ts
import { useMemo } from "react";
import { useTheme as useThemeProvider } from "@/lib/theme-provider";

export function useTheme() {
  const { theme, setTheme } = useThemeProvider();

  const isDark = useMemo(() => theme === "dark", [theme]);

  const toggle = () => setTheme(isDark ? "light" : "dark");

  return { isDark, toggle };
}