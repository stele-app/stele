import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Landing from './routes/Landing';
import About from './routes/About';
import How from './routes/How';
import Examples from './routes/Examples';
import UseCases from './routes/UseCases';
import Viewer from './routes/Viewer';
import Library from './routes/Library';
import Settings from './routes/Settings';
import Pair from './routes/Pair';
import ShareTarget from './routes/ShareTarget';
import Account from './routes/Account';
import Gallery from './routes/Gallery';
import Profile from './routes/Profile';
import Policy from './routes/Policy';
import DropToOpen from './components/DropToOpen';
import FileHandler from './components/FileHandler';
import { AuthProvider } from './auth';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root not found');

createRoot(rootEl).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <DropToOpen />
        <FileHandler />
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/about" element={<About />} />
          <Route path="/how" element={<How />} />
          <Route path="/examples" element={<Examples />} />
          <Route path="/use-cases" element={<UseCases />} />
          <Route path="/view" element={<Viewer />} />
          <Route path="/library" element={<Library />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/pair" element={<Pair />} />
          <Route path="/share-target" element={<ShareTarget />} />
          <Route path="/account" element={<Account />} />
          <Route path="/gallery" element={<Gallery />} />
          <Route path="/u/:handle" element={<Profile />} />
          <Route path="/policy" element={<Policy />} />
        </Routes>
      </AuthProvider>
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
