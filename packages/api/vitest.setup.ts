import { vi } from 'vitest';

// Side-effect import that pulls a RN-only polyfill; node already has URL.
vi.mock('react-native-url-polyfill/auto', () => ({}));
