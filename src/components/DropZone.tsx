import { useCallback, useState } from 'react';

interface DropZoneProps {
  onFileDrop: (source: string, filename: string) => void;
  children: React.ReactNode;
}

const SUPPORTED_EXTENSIONS = ['jsx', 'tsx', 'html', 'svg', 'md', 'mermaid'];

export default function DropZone({ onFileDrop, children }: DropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const file = e.dataTransfer.files[0];
    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ext || !SUPPORTED_EXTENSIONS.includes(ext)) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onFileDrop(reader.result, file.name);
      }
    };
    reader.readAsText(file);
  }, [onFileDrop]);

  return (
    <div
      onDrop={handleDrop}
      onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={() => setIsDragOver(false)}
      style={{ position: 'relative', flex: 1, overflow: 'hidden' }}
    >
      {children}
      {isDragOver && (
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(59, 130, 246, 0.12)',
          border: '3px dashed #3b82f6',
          borderRadius: '12px',
          margin: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 50,
        }}>
          <div style={{ fontSize: '18px', color: '#3b82f6', fontWeight: 500 }}>
            Drop artifact to import
          </div>
        </div>
      )}
    </div>
  );
}
