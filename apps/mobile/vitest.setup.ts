import { vi } from 'vitest';

// __DEV__ is a React Native global; in node, default it to true so dev-only
// branches (e.g., warning logs) are exercised in tests unless overridden.
(globalThis as unknown as { __DEV__: boolean }).__DEV__ = true;

// react-native-url-polyfill (pulled in by @supabase/supabase-js via @dei/api)
// auto-imports a URL polyfill the moment the module is required. In node we
// already have URL, so neutralize the side-effect import to avoid noise.
vi.mock('react-native-url-polyfill/auto', () => ({}));
