import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Landing from './routes/Landing';
import Viewer from './routes/Viewer';
import Library from './routes/Library';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root not found');

createRoot(rootEl).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/view" element={<Viewer />} />
        <Route path="/library" element={<Library />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);

// Register the service worker for offline app-shell caching + installability.
// Skipped in dev because Vite's HMR interacts badly with SW caching; SW runs
// in production builds only.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('[stele] service worker registration failed:', err);
    });
  });
}
