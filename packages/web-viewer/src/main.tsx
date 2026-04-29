import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Landing from './routes/Landing';
import Viewer from './routes/Viewer';
import Library from './routes/Library';
import Settings from './routes/Settings';
import Pair from './routes/Pair';
import ShareTarget from './routes/ShareTarget';
import DropToOpen from './components/DropToOpen';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root not found');

createRoot(rootEl).render(
  <StrictMode>
    <BrowserRouter>
      <DropToOpen />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/view" element={<Viewer />} />
        <Route path="/library" element={<Library />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/pair" element={<Pair />} />
        <Route path="/share-target" element={<ShareTarget />} />
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
