import { HashRouter, Routes, Route } from 'react-router-dom';
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import DropZone from './components/DropZone';
import ErrorBoundary from './components/ErrorBoundary';
import Library from './routes/Library';
import Viewer from './routes/Viewer';
import Settings from './routes/Settings';
import { importArtifact } from './lib/artifact-store';

function AppShell() {
  const navigate = useNavigate();

  const handleFileDrop = useCallback(async (source: string, filename: string) => {
    const artifact = await importArtifact(source, filename);
    navigate(`/view/${artifact.id}`);
  }, [navigate]);

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      background: '#0f172a',
      color: '#e2e8f0',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <Sidebar />
      <DropZone onFileDrop={handleFileDrop}>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, height: '100%' }}>
          <Routes>
            <Route path="/" element={<Library />} />
            <Route path="/view/:id" element={<ErrorBoundary><Viewer /></ErrorBoundary>} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </div>
      </DropZone>
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <AppShell />
    </HashRouter>
  );
}
