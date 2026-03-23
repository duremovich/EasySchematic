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

function parseHash(): { page: string; id?: string; draft?: string; auth?: string } {
  const hash = window.location.hash.slice(1) || "/";
  const [path, query] = hash.split("?");
  const params = new URLSearchParams(query || "");
  const draft = params.get("draft") || undefined;
  const auth = params.get("auth") || undefined;

  if (path.startsWith("/admin/edit/")) return { page: "admin-edit", id: path.slice(12) };
  if (path === "/admin/edit") return { page: "admin-edit" };
  if (path === "/admin/users") return { page: "admin-users" };
  if (path === "/admin") return { page: "admin-users" };
  if (path.startsWith("/device/")) return { page: "device", id: path.slice(8) };
  if (path === "/login") return { page: "login" };
  if (path.startsWith("/submit/")) return { page: "submit", id: path.slice(8), draft, auth };
  if (path === "/submit") return { page: "submit", draft, auth };
  if (path === "/my-submissions") return { page: "my-submissions" };
  if (path === "/review") return { page: "review" };
  if (path.startsWith("/review/")) return { page: "review-detail", id: path.slice(8) };
  if (path === "/profile") return { page: "profile" };
  if (path === "/contributors") return { page: "contributors" };
  return { page: "browse" };
}

export default function App() {
  const [route, setRoute] = useState(parseHash);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onHash = () => {
      setRoute(parseHash());
      setMenuOpen(false);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    const init = async () => {
      // Check for auth handoff token in URL
      const { auth } = parseHash();
      if (auth) {
        try {
          const claimed = await claimAuthToken(auth);
          setUser(claimed);
          // Strip auth param from URL
          const hash = window.location.hash;
          const cleaned = hash.replace(/([?&])auth=[^&]+(&|$)/, (_, p, s) => s ? p : "");
          window.location.hash = cleaned;
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

  const isMod = user?.role === "moderator" || user?.role === "admin";
  const isAdmin = user?.role === "admin" || !!getAdminToken();

  const handleLogout = () => {
    setUser(null);
    window.location.hash = "#/";
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

  const navLinks = (
    <>
      <a href="#/contributors" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
        Contributors
      </a>
      <a href="https://easyschematic.live" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
        Main App
      </a>
      <a href="mailto:support@easyschematic.live" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
        Support
      </a>
      {!authLoading && user && (
        <>
          <a href="#/submit" className="text-sm text-blue-600 hover:text-blue-800 transition-colors font-medium">
            Submit Device
          </a>
          {isMod && (
            <a href="#/review" className="text-sm text-yellow-600 hover:text-yellow-800 transition-colors">
              Review Queue
            </a>
          )}
        </>
      )}
      {isAdmin && (
        <a href="#/admin" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
          Admin
        </a>
      )}
      {!authLoading && (
        user ? (
          <UserMenu user={user} onLogout={handleLogout} />
        ) : (
          <a href="#/login" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
            Log in
          </a>
        )
      )}
    </>
  );

  return (
    <div className="min-h-full flex flex-col">
      <nav ref={menuRef} className="bg-gray-50 border-b border-gray-200 text-gray-900 px-4 sm:px-6 py-3">
        <div className="flex items-center justify-between">
          <a href="#/" className="flex items-center gap-2 text-lg font-semibold tracking-tight hover:text-gray-600 transition-colors">
            <img src="/favicon.svg" alt="" className="w-6 h-6" />
            EasySchematic <span className="text-gray-400 font-normal">Devices</span>
          </a>
          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-4">
            {navLinks}
          </div>
          {/* Mobile hamburger */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="md:hidden p-1 text-gray-500 hover:text-gray-900"
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
        {/* Mobile dropdown */}
        {menuOpen && (
          <div className="md:hidden flex flex-col gap-3 pt-3 pb-1 border-t border-gray-200 mt-3">
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
          isMod ? <ReviewDetailPage id={route.id} /> : <NoAccess />
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
  useEffect(() => { window.location.hash = "#/login"; }, []);
  return null;
}

function NoAccess() {
  return (
    <div className="p-8 text-center text-slate-500">
      You don't have access to this page.
    </div>
  );
}
