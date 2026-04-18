import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import ArtifactCard from '../components/ArtifactCard';
import {
  getArtifacts,
  subscribe,
  importArtifact,
  togglePin,
  deleteArtifact,
  type Artifact,
} from '../lib/artifact-store';

import demoSource from '../fixtures/demo.jsx?raw';

export default function Library() {
  const navigate = useNavigate();
  const [artifacts, setArtifacts] = useState<Artifact[]>(getArtifacts());
  const [search, setSearch] = useState('');

  useEffect(() => {
    return subscribe(() => setArtifacts(getArtifacts()));
  }, []);

  const handleOpen = useCallback((id: string) => {
    navigate(`/view/${id}`);
  }, [navigate]);

  const handleImportDemo = useCallback(async () => {
    const artifact = await importArtifact(demoSource, 'demo-calculator.jsx');
    navigate(`/view/${artifact.id}`);
  }, [navigate]);

  const filtered = search
    ? artifacts.filter(a =>
        a.title.toLowerCase().includes(search.toLowerCase()) ||
        a.originalName.toLowerCase().includes(search.toLowerCase()) ||
        a.tags.some(t => t.toLowerCase().includes(search.toLowerCase()))
      )
    : artifacts;

  return (
    <div style={{ padding: '24px', overflow: 'auto', flex: 1 }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        marginBottom: '24px',
      }}>
        <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: '#e2e8f0' }}>
          Library
        </h1>
        <div style={{ flex: 1 }} />
        <input
          type="text"
          placeholder="Search artifacts..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            padding: '8px 14px',
            borderRadius: '8px',
            border: '1px solid #334155',
            background: '#0f172a',
            color: '#e2e8f0',
            fontSize: '13px',
            width: '220px',
            outline: 'none',
          }}
        />
      </div>

      {/* Grid or empty state */}
      {filtered.length === 0 ? (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '16px',
          paddingTop: '120px',
          color: '#64748b',
        }}>
          <div style={{
            width: '72px',
            height: '72px',
            borderRadius: '16px',
            border: '2px dashed #334155',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '28px',
            color: '#475569',
          }}>
            +
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '15px', marginBottom: '4px' }}>
              {search ? 'No matching artifacts' : 'No artifacts yet'}
            </div>
            <div style={{ fontSize: '13px', color: '#475569' }}>
              Drag and drop .jsx or .tsx files to import
            </div>
          </div>
          {!search && (
            <button
              onClick={handleImportDemo}
              style={{
                marginTop: '8px',
                padding: '10px 24px',
                borderRadius: '8px',
                border: 'none',
                background: '#3b82f6',
                color: 'white',
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Import Demo Artifact
            </button>
          )}
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: '16px',
        }}>
          {filtered.map(artifact => (
            <ArtifactCard
              key={artifact.id}
              artifact={artifact}
              onOpen={handleOpen}
              onTogglePin={togglePin}
              onDelete={deleteArtifact}
            />
          ))}
        </div>
      )}
    </div>
  );
}
