import { NavLink } from 'react-router-dom';
import { useUnread } from '../hooks/useUnread.js';
import { IconBell } from '../assets/icons.jsx';

export function NotificationBell() {
  const unread = useUnread();
  const label = unread ? `Notiser, ${unread} olästa` : 'Notiser';
  return (
    <NavLink to="/notifications" className="icon-btn" aria-label={label} title={label}>
      <IconBell size={22} aria-hidden="true" />
      {unread > 0 && (
        <span className="notif-dot" aria-hidden="true">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </NavLink>
  );
}
