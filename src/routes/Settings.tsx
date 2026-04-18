export default function Settings() {
  return (
    <div style={{ padding: '24px', flex: 1 }}>
      <h1 style={{ margin: '0 0 24px', fontSize: '22px', fontWeight: 700, color: '#e2e8f0' }}>
        Settings
      </h1>
      <div style={{
        background: '#1e293b',
        borderRadius: '12px',
        padding: '24px',
        border: '1px solid #334155',
      }}>
        <div style={{ color: '#94a3b8', fontSize: '14px' }}>
          Settings will be available in a future release.
        </div>
        <div style={{ marginTop: '16px', color: '#475569', fontSize: '13px' }}>
          Planned: watched folders, default file associations, theme, and more.
        </div>
      </div>
    </div>
  );
}
