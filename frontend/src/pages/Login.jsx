import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { PaperPlaneTilt } from "@phosphor-icons/react";

const BG_URL = "https://static.prod-images.emergentagent.com/jobs/9b2428a8-2445-44e2-bbda-4e1f2d4055e6/images/b8e5a1fac0b74b13d4f13285bf9394766acb831a9654039db2aca3b2e9c29249.png";

export default function Login() {
  const { user, login, error } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  if (user) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    const ok = await login(email, password);
    setSubmitting(false);
    if (ok) navigate("/");
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-white" data-testid="login-page">
      {/* Left: form */}
      <div className="flex flex-col justify-between p-8 lg:p-16">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-[#002FA7] flex items-center justify-center">
            <PaperPlaneTilt size={20} color="white" weight="fill" />
          </div>
          <div className="font-display text-lg">MAILMASTER PRO</div>
        </div>

        <div className="max-w-md w-full fade-up">
          <div className="text-xs uppercase tracking-[0.3em] text-[#4B5563] mb-4">Operator login</div>
          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl text-[#111827] leading-[0.95] mb-8">
            Send mail<br />at scale.<br /><span className="text-[#002FA7]">Precisely.</span>
          </h1>
          <p className="text-[#4B5563] mb-8 text-sm leading-relaxed max-w-sm">
            Personalised mail merge with encrypted PDF attachments. Sign in to access your dispatch console.
          </p>

          <form onSubmit={submit} className="space-y-4" data-testid="login-form">
            <div>
              <label className="text-[10px] uppercase tracking-[0.2em] text-[#4B5563] font-semibold block mb-2">Email</label>
              <input
                type="email" required value={email}
                onChange={(e) => setEmail(e.target.value)}
                data-testid="login-email-input"
                className="w-full border border-[#E2E8F0] bg-white px-4 py-3 text-sm focus:border-[#002FA7] focus:outline-none focus:ring-1 focus:ring-[#002FA7]"
                placeholder="admin@example.com"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-[0.2em] text-[#4B5563] font-semibold block mb-2">Password</label>
              <input
                type="password" required value={password}
                onChange={(e) => setPassword(e.target.value)}
                data-testid="login-password-input"
                className="w-full border border-[#E2E8F0] bg-white px-4 py-3 text-sm focus:border-[#002FA7] focus:outline-none focus:ring-1 focus:ring-[#002FA7]"
                placeholder="••••••••"
              />
            </div>
            {error && (
              <div className="text-sm text-[#E53E3E] border border-[#E53E3E] bg-red-50 px-3 py-2" data-testid="login-error">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={submitting}
              data-testid="login-submit-button"
              className="w-full bg-[#002FA7] text-white py-3 text-sm font-semibold hover:bg-[#002080] disabled:opacity-60 transition-colors"
            >
              {submitting ? "Signing in..." : "Sign in →"}
            </button>
          </form>

          <div className="mt-6 text-xs text-[#9CA3AF] border-t border-[#E2E8F0] pt-4">
            Default admin: <span className="font-mono text-[#111827]">admin@example.com</span> / <span className="font-mono text-[#111827]">admin123</span>
          </div>
        </div>

        <div className="text-xs text-[#9CA3AF]">© MailMaster PRO — Personalised dispatch grid.</div>
      </div>

      {/* Right: visual */}
      <div className="hidden lg:block relative overflow-hidden bg-[#F8F9FA] border-l border-[#E2E8F0]">
        <img src={BG_URL} alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-transparent to-white/20" />
        <div className="absolute bottom-12 left-12 right-12 fade-up">
          <div className="text-[10px] uppercase tracking-[0.3em] text-[#4B5563] mb-2">System 01</div>
          <div className="font-display text-3xl text-[#111827] max-w-xs leading-tight">
            One template.<br />Thousands of personalised dispatches.
          </div>
        </div>
      </div>
    </div>
  );
}
