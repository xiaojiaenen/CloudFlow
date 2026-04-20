import { Suspense, lazy } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { GlobalContextMenu } from "./components/GlobalContextMenu";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { StarTrail } from "./components/StarTrail";
import { AuthProvider } from "./context/AuthContext";
import { NoticeProvider } from "./context/NoticeContext";
import { OverlayDialogProvider } from "./context/OverlayDialogContext";

const Login = lazy(() => import("./pages/Login"));
const Workspace = lazy(() => import("./pages/Workspace"));
const Credentials = lazy(() => import("./pages/Credentials"));
const DataCenter = lazy(() => import("./pages/DataCenter"));
const Store = lazy(() => import("./pages/Store"));
const Admin = lazy(() => import("./pages/Admin"));
const Settings = lazy(() => import("./pages/Settings"));
const MonitorCenter = lazy(async () => {
  const module = await import("./pages/MonitorCenter");
  return { default: module.MonitorCenter };
});

function RouteFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0B0C10] text-sm text-zinc-400">
      页面加载中...
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <NoticeProvider>
        <OverlayDialogProvider>
          <BrowserRouter>
            <StarTrail />
            <GlobalContextMenu />
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route
                  path="/"
                  element={
                    <ProtectedRoute>
                      <Workspace />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/credentials"
                  element={
                    <ProtectedRoute>
                      <Credentials />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/data"
                  element={
                    <ProtectedRoute>
                      <DataCenter />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/monitor"
                  element={
                    <ProtectedRoute>
                      <MonitorCenter />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/store"
                  element={
                    <ProtectedRoute>
                      <Store />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin"
                  element={
                    <ProtectedRoute requireAdmin>
                      <Admin />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/alerts"
                  element={
                    <ProtectedRoute>
                      <Navigate to="/monitor?view=alerts" replace />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/settings"
                  element={
                    <ProtectedRoute>
                      <Settings />
                    </ProtectedRoute>
                  }
                />
                <Route path="*" element={<Navigate to="/login" replace />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </OverlayDialogProvider>
      </NoticeProvider>
    </AuthProvider>
  );
}
