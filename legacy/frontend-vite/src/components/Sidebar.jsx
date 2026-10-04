import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const links = [
  { to: '/', label: 'Dashboard', icon: LedgerIcon },
  { to: '/leads', label: 'Leads', icon: FlagIcon },
  { to: '/companies', label: 'Companies', icon: BuildingIcon },
  { to: '/contacts', label: 'Contacts', icon: PeopleIcon },
  { to: '/deals', label: 'Pipeline', icon: TrayIcon },
  { to: '/tasks', label: 'Tasks', icon: CheckIcon },
];

export default function Sidebar() {
  const { user, logout } = useAuth();

  return (
    <aside className="w-60 shrink-0 bg-ink text-paper flex flex-col h-full">
      <div className="px-5 py-6 border-b border-white/10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-ledger flex items-center justify-center font-display text-lg font-semibold">
            L
          </div>
          <div>
            <p className="font-display text-lg leading-tight tracking-tight">Ledgerline</p>
            <p className="text-[11px] text-white/50 leading-tight tracking-wide uppercase">CRM</p>
          </div>
        </div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
                isActive
                  ? 'bg-white/10 text-white font-medium'
                  : 'text-white/60 hover:bg-white/5 hover:text-white/90'
              }`
            }
          >
            <Icon className="w-4 h-4 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="px-5 py-4 border-t border-white/10">
        <div className="flex items-center gap-2.5 mb-3">
          {user?.avatarUrl ? (
            <img src={user.avatarUrl} alt="" className="w-7 h-7 rounded-full shrink-0" referrerPolicy="no-referrer" />
          ) : (
            <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-[11px] font-medium shrink-0">
              {(user?.name || user?.email || '?').slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-xs text-white/80 truncate">{user?.name || user?.email}</p>
            <button onClick={logout} className="text-[11px] text-white/40 hover:text-white/70 transition-colors">
              Log out
            </button>
          </div>
        </div>
        <p className="text-[11px] text-white/40">Ledgerline CRM v1.0</p>
      </div>
    </aside>
  );
}

function LedgerIcon(props) {
  return (
    <svg viewBox="0 0 20 20" fill="none" {...props}>
      <rect x="3" y="3" width="14" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M6 7h8M6 10h8M6 13h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
function FlagIcon(props) {
  return (
    <svg viewBox="0 0 20 20" fill="none" {...props}>
      <path d="M5 17V3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M5 4h9l-2.5 3.25L14 10.5H5" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}
function BuildingIcon(props) {
  return (
    <svg viewBox="0 0 20 20" fill="none" {...props}>
      <path d="M4 17V4.5A1.5 1.5 0 0 1 5.5 3h5A1.5 1.5 0 0 1 12 4.5V17" stroke="currentColor" strokeWidth="1.4" />
      <path d="M12 9h3.5A1.5 1.5 0 0 1 17 10.5V17" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2 17h16" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M6.5 6h1M6.5 9h1M6.5 12h1M9.5 6h1M9.5 9h1M9.5 12h1M13.5 12h1" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
function PeopleIcon(props) {
  return (
    <svg viewBox="0 0 20 20" fill="none" {...props}>
      <circle cx="7" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2.5 16c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="14" cy="6.5" r="2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M12.8 16c0-2 1.6-3.2 3.4-3.2S18 14 18 16" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
function TrayIcon(props) {
  return (
    <svg viewBox="0 0 20 20" fill="none" {...props}>
      <rect x="2.5" y="4" width="4.2" height="12" rx="0.8" stroke="currentColor" strokeWidth="1.3" />
      <rect x="7.9" y="7" width="4.2" height="9" rx="0.8" stroke="currentColor" strokeWidth="1.3" />
      <rect x="13.3" y="10" width="4.2" height="6" rx="0.8" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}
function CheckIcon(props) {
  return (
    <svg viewBox="0 0 20 20" fill="none" {...props}>
      <rect x="3" y="3" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M6.5 10.2l2.2 2.2 4.8-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
