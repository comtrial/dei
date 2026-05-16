/**
 * Vite config for the Playwright chat web harness.
 *
 * Strategy: render the *real* chat screens/components with react-native-web in
 * a real browser, but alias the non-deterministic boundaries:
 *   - react-native            → react-native-web
 *   - @/lib/chat/chat-service → e2e/harness/mockChatService  (no Supabase/Docker)
 *   - expo-router             → __harness_shims__/expo-router (records nav)
 *   - @/providers/auth-provider → __harness_shims__/auth-provider (fixed user)
 *
 * NativeWind className styling is intentionally NOT compiled here — the chat
 * spec assertions are testID / text / visibility / a11y-state based (counter
 * text, send disabled, dialog presence, retry marker), which hold regardless
 * of CSS. This keeps the harness hermetic and fast (no Metro/Expo boot).
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin, transformWithEsbuild } from 'vite';

const mobileRoot = fileURLToPath(new URL('../../', import.meta.url));
const r = (p: string) => path.resolve(mobileRoot, p);

/**
 * Some RN ecosystem deps (@rn-primitives/*, react-native-web internals,
 * lucide-react-native, etc.) ship `.js`/`.mjs` that still contain JSX/flow-free
 * ESNext. esbuild's default loader for those extensions is `js`, which throws
 * on JSX. Transform any served `.js`/`.mjs` with the `jsx` loader so the real
 * components can be bundled unchanged.
 */
function jsxEverywhere(): Plugin {
  return {
    name: 'harness-jsx-everywhere',
    enforce: 'pre',
    async transform(code, id) {
      if (!/\.(mjs|js)$/.test(id)) return null;
      if (id.includes('/node_modules/.vite/')) return null;
      if (!/[<]\/?[A-Za-z>]/.test(code)) return null; // cheap JSX sniff
      const out = await transformWithEsbuild(code, id, {
        loader: 'jsx',
        jsx: 'automatic',
      });
      return { code: out.code, map: out.map };
    },
  };
}

export default defineConfig({
  root: r('e2e/harness'),
  define: {
    'process.env.NODE_ENV': JSON.stringify('test'),
    __DEV__: 'false',
    global: 'globalThis',
  },
  resolve: {
    extensions: ['.web.tsx', '.web.ts', '.tsx', '.ts', '.web.js', '.js', '.jsx', '.json'],
    alias: [
      // RN → RN Web.
      { find: /^react-native$/, replacement: 'react-native-web' },
      // Hermetic boundaries.
      { find: '@/lib/chat/chat-service', replacement: r('e2e/harness/mockChatService.ts') },
      { find: 'expo-router', replacement: r('__harness_shims__/expo-router.ts') },
      { find: '@/providers/auth-provider', replacement: r('__harness_shims__/auth-provider.tsx') },
      { find: '@/__harness_shims__/expo-router', replacement: r('__harness_shims__/expo-router.ts') },
      // RN ecosystem deps that don't resolve cleanly under RN-web/Vite and are
      // NOT load-bearing for the chat spec's testID/text assertions.
      { find: 'lucide-react-native', replacement: r('__harness_shims__/lucide.tsx') },
      { find: 'nativewind', replacement: r('__harness_shims__/nativewind.ts') },
      { find: 'react-native-reanimated', replacement: r('__harness_shims__/rn-reanimated.tsx') },
      { find: 'react-native-screens', replacement: r('__harness_shims__/rn-screens.tsx') },
      { find: '@rn-primitives/dialog', replacement: r('__harness_shims__/rnp-dialog.tsx') },
      { find: '@rn-primitives/slot', replacement: r('__harness_shims__/rnp-slot.tsx') },
      { find: '@rn-primitives/portal', replacement: r('__harness_shims__/rnp-portal.tsx') },
      // App alias.
      { find: /^@\/(.*)$/, replacement: r('$1') },
    ],
  },
  plugins: [jsxEverywhere(), react()],
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react-native-web',
      'react-native-safe-area-context',
    ],
    esbuildOptions: {
      loader: { '.js': 'jsx', '.mjs': 'jsx' },
      resolveExtensions: ['.web.js', '.js', '.ts', '.tsx', '.jsx', '.mjs'],
    },
  },
  server: { host: '127.0.0.1', port: 4317, strictPort: true },
});
