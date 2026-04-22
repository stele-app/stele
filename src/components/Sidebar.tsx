import { useLocation, useNavigate } from 'react-router-dom';

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();

  const isLibrary = location.pathname === '/';
  const isSettings = location.pathname === '/settings';

  const linkStyle = (active: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '8px 12px',
    borderRadius: '8px',
    fontSize: '13px',
    cursor: 'pointer',
    border: 'none',
    width: '100%',
    textAlign: 'left',
    background: active ? 'rgba(51, 65, 85, 0.5)' : 'transparent',
    color: active ? '#f1f5f9' : '#94a3b8',
    transition: 'all 150ms',
  });

  return (
    <aside style={{
      width: '220px',
      borderRight: '1px solid #1e293b',
      padding: '16px 12px',
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
      flexShrink: 0,
    }}>
      <div style={{
        padding: '4px 8px 16px',
        fontSize: '18px',
        fontWeight: 700,
        color: '#e2e8f0',
        letterSpacing: '-0.02em',
      }}>
        Stele
      </div>

      <button
        onClick={() => navigate('/')}
        style={linkStyle(isLibrary)}
        onMouseEnter={e => {
          if (!isLibrary) {
            e.currentTarget.style.color = '#e2e8f0';
            e.currentTarget.style.background = 'rgba(30, 41, 59, 0.5)';
          }
        }}
        onMouseLeave={e => {
          if (!isLibrary) {
            e.currentTarget.style.color = '#94a3b8';
            e.currentTarget.style.background = 'transparent';
          }
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="1.5" y="1.5" width="5" height="5" rx="1" />
          <rect x="9.5" y="1.5" width="5" height="5" rx="1" />
          <rect x="1.5" y="9.5" width="5" height="5" rx="1" />
          <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
        </svg>
        Library
      </button>

      <button
        onClick={() => navigate('/settings')}
        style={linkStyle(isSettings)}
        onMouseEnter={e => {
          if (!isSettings) {
            e.currentTarget.style.color = '#e2e8f0';
            e.currentTarget.style.background = 'rgba(30, 41, 59, 0.5)';
          }
        }}
        onMouseLeave={e => {
          if (!isSettings) {
            e.currentTarget.style.color = '#94a3b8';
            e.currentTarget.style.background = 'transparent';
          }
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="8" cy="8" r="2.5" />
          <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.1 3.1l1.4 1.4M11.5 11.5l1.4 1.4M3.1 12.9l1.4-1.4M11.5 4.5l1.4-1.4" />
        </svg>
        Settings
      </button>

      <div style={{ flex: 1 }} />

      <div style={{
        padding: '8px',
        fontSize: '11px',
        color: '#475569',
        textAlign: 'center',
      }}>
        v0.2.1
      </div>
    </aside>
  );
}
