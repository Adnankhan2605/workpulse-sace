// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

interface LogEntry {
  code?: string;
  message?: string;
}

type LogHandler = (level: string, log: LogEntry) => void;
type WarnHandler = (warning: LogEntry) => void;

function shouldIgnoreLog(entry?: LogEntry): boolean {
  return Boolean(
    entry?.code === "MODULE_LEVEL_DIRECTIVE" || entry?.message?.includes('directive "use client"'),
  );
}

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
    client: { entry: "client" },
  },
  nitro: {
    rolldownConfig: {
      onLog(level: string, log: LogEntry, defaultHandler: LogHandler) {
        if (shouldIgnoreLog(log)) return;
        defaultHandler(level, log);
      },
    },
    rollupConfig: {
      onwarn(warning: LogEntry, defaultHandler: WarnHandler) {
        if (shouldIgnoreLog(warning)) return;
        defaultHandler(warning);
      },
    },
  },
  vite: {
    build: {
      rolldownOptions: {
        onLog(level: string, log: LogEntry, defaultHandler: LogHandler) {
          if (shouldIgnoreLog(log)) return;
          defaultHandler(level, log);
        },
      },
      rollupOptions: {
        onLog(level: string, log: LogEntry, defaultHandler: LogHandler) {
          if (shouldIgnoreLog(log)) return;
          defaultHandler(level, log);
        },
        onwarn(warning: LogEntry, defaultHandler: WarnHandler) {
          if (shouldIgnoreLog(warning)) return;
          defaultHandler(warning);
        },
      },
    },
  },
});
