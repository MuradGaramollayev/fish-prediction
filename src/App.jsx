import { Routes, Route, Navigate } from "react-router-dom";
import { createContext, useContext, useState } from "react";
import Landing from "./pages/Landing.jsx";
import Signup from "./pages/Signup.jsx";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";

export const AuthContext = createContext(null);
export function useAuth() {
  return useContext(AuthContext);
}

function ProtectedRoute({ children }) {
  const { token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  const [token, setToken] = useState(localStorage.getItem("token"));
  const [userName, setUserName] = useState(localStorage.getItem("userName") || "");

  function login(accessToken, name) {
    localStorage.setItem("token", accessToken);
    localStorage.setItem("userName", name || "");
    setToken(accessToken);
    setUserName(name || "");
  }

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("userName");
    setToken(null);
    setUserName("");
  }

  return (
    <AuthContext.Provider value={{ token, userName, login, logout }}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/login" element={<Login />} />
        <Route
          path="/app"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
      </Routes>
    </AuthContext.Provider>
  );
}
