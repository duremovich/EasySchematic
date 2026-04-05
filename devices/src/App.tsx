import { useState, useEffect, useRef } from "react";
import { fetchCurrentUser, claimAuthToken, getAdminToken } from "./api";
import type { User } from "./api";
import BrowsePage from "./pages/BrowsePage";
import DeviceDetailPage from "./pages/DeviceDetailPage";
import AdminEditorPage from "./pages/AdminEditorPage";
import LoginPage from "./pages/LoginPage";
import SubmitPage from "./pages/SubmitPage";
import MySubmissionsPage from "./pages/MySubmissionsPage";
import ReviewQueuePage from "./pages/ReviewQueuePage";
import ReviewDetailPage from "./pages/ReviewDetailPage";
import AdminUsersPage from "./pages/AdminUsersPage";
import ProfilePage from "./pages/ProfilePage";
import ContributorsPage from "./pages/ContributorsPage";
import UserMenu from "./components/UserMenu";
import { navigateTo, linkClick } from "./navigate";
import { useTheme } from "./hooks/useTheme";

function parseRoute(): { page: string; id?: string; draft?: string; auth?: string } {
  const path = window.location.pathname;
  const params = new URLSearchParams(window.location.search);
  const draft = params.get("draft") || undefined;
  const auth = params.get("auth") || undefined;

  if (path.startsWith("/admin/edit/")) return { page: "admin-edit", id: path.slice(12), auth };
  if (path === "/admin/edit") return { page: "admin-edit", auth };
  if (path === "/admin/users") return { page: "admin-users", auth };
  if (path === "/admin") return { page: "admin-users", auth };
  if (path.startsWith("/device/")) return { page: "device", id: path.slice(8), auth };
  if (path === "/login") return { page: "login", auth };
  if (path.startsWith("/submit/")) return { page: "submit", id: path.slice(8), draft, auth };
  if (path === "/submit") return { page: "submit", draft, auth };
  if (path === "/my-submissions") return { page: "my-submissions", auth };
  if (path === "/review") return { page: "review", auth };
  if (path.startsWith("/review/")) return { page: "review-detail", id: path.slice(8), auth };
  if (path === "/profile") return { page: "profile", auth };
  if (path === "/contributors") return { page: "contributors", auth };
  return { page: "browse", auth };
}

// Redirect legacy hash URLs to path equivalents (before React mounts)
{
  const hash = window.location.hash;
  if (hash && hash.startsWith("#/")) {
    window.history.replaceState({}, "", hash.slice(1));
  }
}

export default function App() {
  const [route, setRoute] = useState(parseRoute);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPopState = () => {
      setRoute(parseRoute());
      setMenuOpen(false);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    const init = async () => {
      // Check for auth handoff token in URL
      const { auth } = parseRoute();
      if (auth) {
        try {
          const claimed = await claimAuthToken(auth);
          setUser(claimed);
          // Strip auth param from URL
          const url = new URL(window.location.href);
          url.searchParams.delete("auth");
          window.history.replaceState({}, "", url.pathname + (url.search || ""));
          setAuthLoading(false);
          return;
        } catch {
          // Token invalid/expired — fall through to normal session check
        }
      }
      const u = await fetchCurrentUser();
      setUser(u);
      setAuthLoading(false);
    };
    init();
  }, []);

  // Update JSON-LD structured data
  useEffect(() => {
    const jsonLd = route.page === "browse"
      ? { "@context": "https://schema.org", "@type": "ItemList", "name": "EasySchematic Device Database", "url": "https://devices.easyschematic.live/" }
      : route.page === "contributors"
      ? { "@context": "https://schema.org", "@type": "WebPage", "name": "EasySchematic Contributors", "url": "https://devices.easyschematic.live/contributors" }
      : null;
    let script = document.querySelector<HTMLScriptElement>('script[data-jsonld]');
    if (jsonLd) {
      if (!script) {
        script = document.createElement("script");
        script.type = "application/ld+json";
        script.setAttribute("data-jsonld", "");
        document.head.appendChild(script);
      }
      script.textContent = JSON.stringify(jsonLd);
    } else if (script) {
      script.remove();
    }
  }, [route.page]);

  const { isDark, toggle: toggleTheme } = useTheme();

  const isMod = user?.role === "moderator" || user?.role === "admin";
  const isAdmin = user?.role === "admin" || !!getAdminToken();

  const handleLogout = () => {
    setUser(null);
    navigateTo("/");
  };

  // Close menu on click outside
  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  const themeToggle = (
    <button
      onClick={toggleTheme}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="p-1.5 rounded text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-100 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
    >
      {isDark ? (
        <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="8" cy="8" r="3.5" />
          <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M3.05 12.95l1.06-1.06M11.89 4.11l1.06-1.06" />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" className="w-4 h-4" fill="currentColor">
          <path d="M6 .278a.77.77 0 0 1 .08.858 7.208 7.208 0 0 0-.878 3.46c0 4.021 3.278 7.277 7.318 7.277.527 0 1.04-.055 1.533-.16a.787.787 0 0 1 .81.316.733.733 0 0 1-.031.893A8.349 8.349 0 0 1 8.344 16C3.734 16 0 12.286 0 7.71 0 4.266 2.114 1.312 5.124.06A.752.752 0 0 1 6 .278z" />
        </svg>
      )}
    </button>
  );

  const navLinks = (
    <>
      <a href="/contributors" onClick={linkClick} className="text-sm text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-100 transition-colors">
        Contributors
      </a>
      <a href="https://easyschematic.live" className="text-sm text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-100 transition-colors">
        Main App
      </a>
      <a href="mailto:support@easyschematic.live" className="text-sm text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-100 transition-colors">
        Support
      </a>
      {!authLoading && user && (
        <>
          <a href="/submit" onClick={linkClick} className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors font-medium">
            Submit Device
          </a>
          {isMod && (
            <a href="/review" onClick={linkClick} className="text-sm text-yellow-600 dark:text-yellow-400 hover:text-yellow-800 dark:hover:text-yellow-300 transition-colors">
              Review Queue
            </a>
          )}
        </>
      )}
      {isAdmin && (
        <a href="/admin" onClick={linkClick} className="text-sm text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-100 transition-colors">
          Admin
        </a>
      )}
      {!authLoading && (
        user ? (
          <UserMenu user={user} onLogout={handleLogout} />
        ) : (
          <a href="/login" onClick={linkClick} className="text-sm text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-100 transition-colors">
            Log in
          </a>
        )
      )}
    </>
  );

  return (
    <div className="min-h-full flex flex-col">
      <nav ref={menuRef} className="bg-gray-50 dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700 text-gray-900 dark:text-slate-100 px-4 sm:px-6 py-3">
        <div className="flex items-center justify-between">
          <a href="/" onClick={linkClick} className="flex items-center gap-2 text-lg font-semibold tracking-tight hover:text-gray-600 dark:hover:text-slate-300 transition-colors">
            <img src="/favicon.svg" alt="" className="w-6 h-6" />
            EasySchematic <span className="text-gray-400 dark:text-slate-500 font-normal">Devices</span>
          </a>
          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-4">
            {navLinks}
            {themeToggle}
          </div>
          {/* Mobile: theme toggle + hamburger */}
          <div className="md:hidden flex items-center gap-1">
            {themeToggle}
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="p-1 text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-100"
              aria-label="Toggle menu"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                {menuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>
        {/* Mobile dropdown */}
        {menuOpen && (
          <div className="md:hidden flex flex-col gap-3 pt-3 pb-1 border-t border-gray-200 dark:border-slate-700 mt-3">
            {navLinks}
          </div>
        )}
      </nav>
      <main className="flex-1">
        {route.page === "browse" && <BrowsePage />}
        {route.page === "device" && route.id && <DeviceDetailPage id={route.id} />}
        {route.page === "login" && <LoginPage />}
        {route.page === "submit" && (
          authLoading ? null : user ? <SubmitPage id={route.id} draftId={route.draft} /> : <LoginRedirect />
        )}
        {route.page === "my-submissions" && (
          authLoading ? null : user ? <MySubmissionsPage /> : <LoginRedirect />
        )}
        {route.page === "review" && (
          isMod ? <ReviewQueuePage /> : <NoAccess />
        )}
        {route.page === "review-detail" && route.id && (
          isMod ? <ReviewDetailPage id={route.id} currentUserId={user?.id} /> : <NoAccess />
        )}
        {route.page === "profile" && (
          authLoading ? null : user ? <ProfilePage user={user} onUpdate={setUser} /> : <LoginRedirect />
        )}
        {route.page === "contributors" && <ContributorsPage />}
        {route.page === "admin-users" && (
          isAdmin ? <AdminUsersPage /> : <NoAccess />
        )}
        {route.page === "admin-edit" && <AdminEditorPage id={route.id} />}
      </main>
    </div>
  );
}

function LoginRedirect() {
  useEffect(() => { navigateTo("/login"); }, []);
  return null;
}

function NoAccess() {
  return (
    <div className="p-8 text-center text-slate-500">
      You don't have access to this page.
    </div>
  );
}
