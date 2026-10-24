'use client';

import { DEMO_USERS, useCurrentUser } from '../lib/currentUser';

// Header dropdown for switching between the four seeded demo users.
export default function UserSwitcher({ className = '' }: { className?: string }) {
  const { user, setUser } = useCurrentUser();

  return (
    <label className={`flex items-center gap-2 text-sm ${className}`}>
      <span className="sr-only">Demo user</span>
      <select
        value={user.id}
        onChange={(e) => setUser(e.target.value)}
        className="rounded-full border border-white/20 bg-black/60 px-3 py-1.5 text-white backdrop-blur focus:outline-none focus:ring-2 focus:ring-cyan-400"
      >
        {DEMO_USERS.map((u) => (
          <option key={u.id} value={u.id}>
            {u.display_name}
            {u.role !== 'student' ? ` (${u.role})` : ''}
          </option>
        ))}
      </select>
    </label>
  );
}

export { useCurrentUser } from '../lib/currentUser';
