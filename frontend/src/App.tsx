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

export default function App() {
  return (
    <BrowserRouter>
      <StarTrail />
      <GlobalContextMenu />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Workspace />} />
        <Route path="/monitor" element={<MonitorCenter />} />
        <Route path="/store" element={<Store />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/alerts" element={<Alerts />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
