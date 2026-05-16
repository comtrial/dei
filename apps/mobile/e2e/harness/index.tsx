/**
 * Web harness entry. Boots react-native-web + SafeAreaProvider and mounts the
 * real chat screens (see App.tsx). Bundled by Vite for Playwright.
 */
import { createRoot } from 'react-dom/client';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import HarnessApp from './App';

function Root() {
  return (
    <SafeAreaProvider
      // '100vh' is a web-only CSS value (react-native-web resolves it in the
      // browser) that RN's DimensionValue type does not model — mirror the
      // cast already used in App.tsx for the harness root view.
      style={{ height: '100vh' as unknown as number, width: '100%' }}
      initialMetrics={{
        frame: { x: 0, y: 0, width: 480, height: 800 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}>
      <HarnessApp />
    </SafeAreaProvider>
  );
}

const rootTag = document.getElementById('root');
if (rootTag) {
  createRoot(rootTag).render(<Root />);
}
