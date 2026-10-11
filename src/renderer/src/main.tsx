import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './app.component';
import { TooltipProvider } from '~/components/ui';
import { applyTheme, DEFAULT_THEME } from '~/lib/theme';
import './styles.css';

// Paint the theme before React's first render. `useThemeEffect` applies the
// same values again once mounted; that pass is a no-op. Without this the app
// shows one frame of unstyled variables before the effect runs.
applyTheme(DEFAULT_THEME);

const host = document.getElementById('root');
if (!host) throw new Error('index.html is missing #root');

// Radix tooltips need a provider above every trigger, and it is also what
// shares the open/close delay between them — so that moving along a row of
// icon buttons shows the second tooltip immediately instead of waiting out the
// delay again. One provider at the root rather than one per call site.
createRoot(host).render(
  <StrictMode>
    <TooltipProvider delayDuration={400}>
      <App />
    </TooltipProvider>
  </StrictMode>
);
