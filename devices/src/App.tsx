import { useState, useEffect } from "react";
import { fetchCurrentUser, getAdminToken } from "./api";
import type { User } from "./api";
import BrowsePage from "./pages/BrowsePage";
import DeviceDetailPage from "./pages/DeviceDetailPage";
import AdminEditorPage from "./pages/AdminEditorPage";
import LoginPage from "./pages/LoginPage";
import SubmitPage from "./pages/SubmitPage";
import MySubmissionsPage from "./pages/MySubmissionsPage";
import ReviewQueuePage from "./pages/ReviewQueuePage";
import ReviewDetailPage from "./pages/ReviewDetailPage";
import UserMenu from "./components/UserMenu";

function parseHash(): { page: string; id?: string } {
  const hash = window.location.hash.slice(1) || "/";
  if (hash.startsWith("/admin/edit/")) return { page: "admin-edit", id: hash.slice(12) };
  if (hash === "/admin") return { page: "admin-edit" };
  if (hash.startsWith("/device/")) return { page: "device", id: hash.slice(8) };
  if (hash === "/login") return { page: "login" };
  if (hash.startsWith("/submit/")) return { page: "submit", id: hash.slice(8) };
  if (hash === "/submit") return { page: "submit" };
  if (hash === "/my-submissions") return { page: "my-submissions" };
  if (hash === "/review") return { page: "review" };
  if (hash.startsWith("/review/")) return { page: "review-detail", id: hash.slice(8) };
  return { page: "browse" };
}

export default function App() {
  const [route, setRoute] = useState(parseHash);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    fetchCurrentUser()
      .then(setUser)
      .finally(() => setAuthLoading(false));
  }, []);

  const isMod = user?.role === "moderator" || user?.role === "admin";
  const isAdmin = user?.role === "admin" || !!getAdminToken();

  const handleLogout = () => {
    setUser(null);
    window.location.hash = "#/";
  };

  return (
    <div className="min-h-full flex flex-col">
      <nav className="bg-slate-900 text-white px-6 py-3 flex items-center justify-between">
        <a href="#/" className="text-lg font-semibold tracking-tight hover:text-slate-300 transition-colors">
          EasySchematic <span className="text-slate-400 font-normal">Devices</span>
        </a>
        <div className="flex items-center gap-4">
          <a href="https://easyschematic.live" className="text-sm text-slate-400 hover:text-white transition-colors">
            Main App
          </a>
          {!authLoading && user && (
            <>
              <a href="#/submit" className="text-sm text-blue-400 hover:text-blue-300 transition-colors font-medium">
                Submit Device
              </a>
              {isMod && (
                <a href="#/review" className="text-sm text-yellow-400 hover:text-yellow-300 transition-colors">
                  Review Queue
                </a>
              )}
            </>
          )}
          {isAdmin && (
            <a href="#/admin" className="text-sm text-slate-400 hover:text-white transition-colors">
              Admin
            </a>
          )}
          {!authLoading && (
            user ? (
              <UserMenu user={user} onLogout={handleLogout} />
            ) : (
              <a href="#/login" className="text-sm text-slate-400 hover:text-white transition-colors">
                Log in
              </a>
            )
          )}
        </div>
      </nav>
      <main className="flex-1">
        {route.page === "browse" && <BrowsePage />}
        {route.page === "device" && route.id && <DeviceDetailPage id={route.id} />}
        {route.page === "login" && <LoginPage />}
        {route.page === "submit" && (
          user ? <SubmitPage id={route.id} /> : <LoginRedirect />
        )}
        {route.page === "my-submissions" && (
          user ? <MySubmissionsPage /> : <LoginRedirect />
        )}
        {route.page === "review" && (
          isMod ? <ReviewQueuePage /> : <NoAccess />
        )}
        {route.page === "review-detail" && route.id && (
          isMod ? <ReviewDetailPage id={route.id} /> : <NoAccess />
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
