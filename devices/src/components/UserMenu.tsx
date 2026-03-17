import { useState, useRef, useEffect } from "react";
import type { User } from "../api";
import { logout } from "../api";

interface Props {
  user: User;
  onLogout: () => void;
}

export default function UserMenu({ user, onLogout }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleLogout = async () => {
    await logout();
    onLogout();
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="text-sm text-gray-500 hover:text-gray-900 transition-colors flex items-center gap-1"
      >
        {user.name || user.email}
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-50">
          <div className="px-3 py-2 border-b border-slate-100">
            <p className="text-xs text-slate-500 truncate">{user.email}</p>
            <p className="text-xs text-slate-400 capitalize">{user.role}</p>
          </div>
          <a href="#/profile" onClick={() => setOpen(false)} className="block px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
            Profile
          </a>
          <a href="#/my-submissions" onClick={() => setOpen(false)} className="block px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
            My Submissions
          </a>
          <button onClick={handleLogout} className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50">
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
