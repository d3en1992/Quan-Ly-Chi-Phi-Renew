import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './app/App';
import { applySavedTheme } from './app/theme';
import { startPwaAutoUpdate } from './app/pwa-update';

applySavedTheme();
startPwaAutoUpdate();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
