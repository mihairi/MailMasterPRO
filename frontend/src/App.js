import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import Layout from "@/components/Layout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Compose from "@/pages/Compose";
import EmailTemplates from "@/pages/EmailTemplates";
import WordTemplates from "@/pages/WordTemplates";
import History from "@/pages/History";
import Users from "@/pages/Users";
import ApiKeys from "@/pages/ApiKeys";
import ApiDocs from "@/pages/ApiDocs";
import { Toaster } from "@/components/ui/sonner";

function App() {
  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
              <Route index element={<Dashboard />} />
              <Route path="compose" element={<Compose />} />
              <Route path="email-templates" element={<EmailTemplates />} />
              <Route path="word-templates" element={<WordTemplates />} />
              <Route path="history" element={<History />} />
              <Route path="users" element={<ProtectedRoute adminOnly><Users /></ProtectedRoute>} />
              <Route path="api-keys" element={<ProtectedRoute adminOnly><ApiKeys /></ProtectedRoute>} />
              <Route path="api-docs" element={<ProtectedRoute adminOnly><ApiDocs /></ProtectedRoute>} />
            </Route>
          </Routes>
        </BrowserRouter>
        <Toaster richColors />
      </AuthProvider>
    </div>
  );
}

export default App;
