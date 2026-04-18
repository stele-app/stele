import { NavLink } from 'react-router-dom';

export default function Sidebar() {
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
      isActive
        ? 'bg-slate-700/50 text-white'
        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
    }`;

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
        Atelier
      </div>

      <NavLink to="/" className={linkClass}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="1.5" y="1.5" width="5" height="5" rx="1" />
          <rect x="9.5" y="1.5" width="5" height="5" rx="1" />
          <rect x="1.5" y="9.5" width="5" height="5" rx="1" />
          <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
        </svg>
        Library
      </NavLink>

      <NavLink to="/settings" className={linkClass}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="8" cy="8" r="2.5" />
          <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.1 3.1l1.4 1.4M11.5 11.5l1.4 1.4M3.1 12.9l1.4-1.4M11.5 4.5l1.4-1.4" />
        </svg>
        Settings
      </NavLink>

      <div style={{ flex: 1 }} />

      <div style={{
        padding: '8px',
        fontSize: '11px',
        color: '#475569',
        textAlign: 'center',
      }}>
        v0.1.0-alpha
      </div>
    </aside>
  );
}
