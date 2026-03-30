import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Workspace from "./pages/Workspace";
import Store from "./pages/Store";
import Admin from "./pages/Admin";
import Alerts from "./pages/Alerts";
import Settings from "./pages/Settings";
import { MonitorCenter } from "./pages/MonitorCenter";
import { StarTrail } from "./components/StarTrail";
import { GlobalContextMenu } from "./components/GlobalContextMenu";
import { AuthProvider } from "./context/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <StarTrail />
        <GlobalContextMenu />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<ProtectedRoute><Workspace /></ProtectedRoute>} />
          <Route path="/monitor" element={<ProtectedRoute><MonitorCenter /></ProtectedRoute>} />
          <Route path="/store" element={<ProtectedRoute><Store /></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute requireAdmin><Admin /></ProtectedRoute>} />
          <Route path="/alerts" element={<ProtectedRoute><Alerts /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
