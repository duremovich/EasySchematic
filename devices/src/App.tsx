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
import AdminUsersPage from "./pages/AdminUsersPage";
import ProfilePage from "./pages/ProfilePage";
import ContributorsPage from "./pages/ContributorsPage";
import UserMenu from "./components/UserMenu";

function parseHash(): { page: string; id?: string } {
  const hash = window.location.hash.slice(1) || "/";
  if (hash.startsWith("/admin/edit/")) return { page: "admin-edit", id: hash.slice(12) };
  if (hash === "/admin/edit") return { page: "admin-edit" };
  if (hash === "/admin/users") return { page: "admin-users" };
  if (hash === "/admin") return { page: "admin-users" };
  if (hash.startsWith("/device/")) return { page: "device", id: hash.slice(8) };
  if (hash === "/login") return { page: "login" };
  if (hash.startsWith("/submit/")) return { page: "submit", id: hash.slice(8) };
  if (hash === "/submit") return { page: "submit" };
  if (hash === "/my-submissions") return { page: "my-submissions" };
  if (hash === "/review") return { page: "review" };
  if (hash.startsWith("/review/")) return { page: "review-detail", id: hash.slice(8) };
  if (hash === "/profile") return { page: "profile" };
  if (hash === "/contributors") return { page: "contributors" };
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
      <nav className="bg-gray-50 border-b border-gray-200 text-gray-900 px-6 py-3 flex items-center justify-between">
        <a href="#/" className="flex items-center gap-2 text-lg font-semibold tracking-tight hover:text-gray-600 transition-colors">
          <img src="/favicon.svg" alt="" className="w-6 h-6" />
          EasySchematic <span className="text-gray-400 font-normal">Devices</span>
        </a>
        <div className="flex items-center gap-4">
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
        {route.page === "profile" && (
          user ? <ProfilePage user={user} onUpdate={setUser} /> : <LoginRedirect />
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
