import { useState, useEffect } from 'react';
import { open as dialogOpen } from '@tauri-apps/plugin-dialog';
import { getArtifacts, subscribe } from '../lib/artifact-store';
import {
  getWatchedFolders,
  addWatchedFolder,
  removeWatchedFolder,
  toggleWatchedFolder,
  subscribeWatcher,
} from '../lib/watcher';

export default function Settings() {
  const [artifacts, setArtifacts] = useState(getArtifacts());
  const [watchedFolders, setWatchedFolders] = useState(getWatchedFolders());

  useEffect(() => subscribe(() => setArtifacts(getArtifacts())), []);
  useEffect(() => subscribeWatcher(() => setWatchedFolders(getWatchedFolders())), []);

  const totalSize = artifacts.reduce((sum, a) => sum + a.sizeBytes, 0);
  const kindCounts = artifacts.reduce((acc, a) => {
    acc[a.kind] = (acc[a.kind] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  async function handleAddFolder() {
    try {
      const selected = await dialogOpen({
        directory: true,
        multiple: false,
        title: 'Select folder to watch for artifacts',
      });
      if (selected && typeof selected === 'string') {
        await addWatchedFolder(selected);
      }
    } catch (err) {
      console.error('[settings] Failed to add watched folder:', err);
    }
  }

  const Section = ({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) => (
    <div style={{
      background: '#1e293b',
      borderRadius: '12px',
      padding: '20px 24px',
      border: '1px solid #334155',
      marginBottom: '16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#e2e8f0', flex: 1 }}>
          {title}
        </h2>
        {action}
      </div>
      {children}
    </div>
  );

  const StatRow = ({ label, value }: { label: string; value: string | number }) => (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      padding: '6px 0',
      fontSize: '14px',
    }}>
      <span style={{ color: '#94a3b8' }}>{label}</span>
      <span style={{ color: '#e2e8f0', fontWeight: 500 }}>{value}</span>
    </div>
  );

  return (
    <div style={{ padding: '24px', flex: 1, overflow: 'auto', maxWidth: '640px' }}>
      <h1 style={{ margin: '0 0 24px', fontSize: '22px', fontWeight: 700, color: '#e2e8f0' }}>
        Settings
      </h1>

      <Section title="Library">
        <StatRow label="Total artifacts" value={artifacts.length} />
        <StatRow label="Total size" value={formatSize(totalSize)} />
        <StatRow label="Pinned" value={artifacts.filter(a => a.pinned).length} />
        {Object.entries(kindCounts).sort().map(([kind, count]) => (
          <StatRow key={kind} label={`.${kind} files`} value={count} />
        ))}
      </Section>

      <Section
        title="Watched Folders"
        action={
          <button
            onClick={handleAddFolder}
            style={{
              padding: '4px 12px',
              borderRadius: '6px',
              border: 'none',
              background: '#3b82f6',
              color: 'white',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            + Add Folder
          </button>
        }
      >
        {watchedFolders.length === 0 ? (
          <div style={{ color: '#475569', fontSize: '13px' }}>
            No watched folders. Add a folder to auto-import new artifact files.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {watchedFolders.map(folder => (
              <div key={folder.path} style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '8px 12px',
                borderRadius: '8px',
                background: '#0f172a',
                border: '1px solid #334155',
              }}>
                <div style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: folder.enabled ? '#22c55e' : '#475569',
                  flexShrink: 0,
                }} />
                <div style={{
                  flex: 1,
                  fontSize: '13px',
                  color: '#e2e8f0',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  direction: 'rtl',
                  textAlign: 'left',
                }}>
                  {folder.path}
                </div>
                <button
                  onClick={() => toggleWatchedFolder(folder.path)}
                  style={{
                    padding: '2px 8px',
                    borderRadius: '4px',
                    border: '1px solid #334155',
                    background: 'transparent',
                    color: '#94a3b8',
                    fontSize: '11px',
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                >
                  {folder.enabled ? 'Pause' : 'Resume'}
                </button>
                <button
                  onClick={() => removeWatchedFolder(folder.path)}
                  style={{
                    padding: '2px 8px',
                    borderRadius: '4px',
                    border: '1px solid #334155',
                    background: 'transparent',
                    color: '#ef4444',
                    fontSize: '11px',
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
        <div style={{ marginTop: '10px', fontSize: '12px', color: '#475569' }}>
          New .jsx, .tsx, .html, .svg, .md, and .mermaid files are auto-imported.
        </div>
      </Section>

      <Section title="File Associations">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {['jsx', 'tsx', 'html', 'svg', 'md', 'mermaid'].map(ext => (
            <span key={ext} style={{
              padding: '4px 10px',
              borderRadius: '6px',
              background: '#0f172a',
              border: '1px solid #334155',
              fontSize: '13px',
              color: '#94a3b8',
            }}>
              .{ext}
            </span>
          ))}
        </div>
        <div style={{ marginTop: '8px', fontSize: '12px', color: '#475569' }}>
          File associations are registered when installing via the NSIS or MSI installer.
        </div>
      </Section>

      <Section title="About">
        <div style={{ fontSize: '14px', color: '#94a3b8', lineHeight: 1.8 }}>
          <div><strong style={{ color: '#e2e8f0' }}>Atelier</strong> v0.1.0</div>
          <div>The player for what Claude builds.</div>
          <div style={{ marginTop: '12px', fontSize: '13px' }}>
            <div>Tauri 2 + React 19 + esbuild-wasm</div>
            <div>SQLite for persistence, sandboxed iframe rendering</div>
          </div>
          <div style={{ marginTop: '12px' }}>
            <a
              href="https://github.com/Trevo88423/Atelier"
              target="_blank"
              rel="noopener"
              style={{ color: '#3b82f6', textDecoration: 'none', fontSize: '13px' }}
            >
              GitHub Repository
            </a>
          </div>
        </div>
      </Section>
    </div>
  );
}
