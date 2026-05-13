import { useEffect, useState } from "react";
import api, { formatApiErrorDetail } from "@/lib/api";
import { Header } from "@/pages/Dashboard";
import { Plus, Trash, UserCircle } from "@phosphor-icons/react";

const AVATARS = [
  "https://images.unsplash.com/photo-1762522926157-bcc04bf0b10a?crop=entropy&cs=srgb&fm=jpg&w=80&q=70",
  "https://images.unsplash.com/photo-1576558656222-ba66febe3dec?crop=entropy&cs=srgb&fm=jpg&w=80&q=70",
  "https://images.unsplash.com/photo-1655249493799-9cee4fe983bb?crop=entropy&cs=srgb&fm=jpg&w=80&q=70",
];

export default function Users() {
  const [users, setUsers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("user");
  const [error, setError] = useState("");

  const load = () => api.get("/users").then((r) => setUsers(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);

  const create = async () => {
    setError("");
    try {
      await api.post("/users", { email, password, name, role });
      setEmail(""); setPassword(""); setName(""); setRole("user");
      setShowForm(false);
      load();
    } catch (err) {
      setError(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    }
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this user?")) return;
    try { await api.delete(`/users/${id}`); load(); } catch (err) { setError(formatApiErrorDetail(err.response?.data?.detail) || err.message); }
  };

  return (
    <div className="p-8 lg:p-12 fade-up" data-testid="users-page">
      <Header
        eyebrow="Admin"
        title="User Management"
        sub="Add or remove operators. Admins can manage everyone; users see only their own sends."
        right={
          !showForm && (
            <button onClick={() => setShowForm(true)} data-testid="new-user-button" className="bg-[#002FA7] text-white px-5 py-2.5 text-sm font-semibold hover:bg-[#002080] flex items-center gap-2">
              <Plus size={16} weight="bold" /> New user
            </button>
          )
        }
      />

      {showForm && (
        <div className="mt-8 border border-[#E2E8F0] bg-white p-6" data-testid="new-user-form">
          <div className="grid sm:grid-cols-4 gap-3">
            <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} data-testid="new-user-name" className="w-full border border-[#E2E8F0] px-3 py-2 text-sm" /></Field>
            <Field label="Email"><input value={email} onChange={(e) => setEmail(e.target.value)} data-testid="new-user-email" className="w-full border border-[#E2E8F0] px-3 py-2 text-sm" /></Field>
            <Field label="Password"><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} data-testid="new-user-password" className="w-full border border-[#E2E8F0] px-3 py-2 text-sm" /></Field>
            <Field label="Role">
              <select value={role} onChange={(e) => setRole(e.target.value)} data-testid="new-user-role" className="w-full border border-[#E2E8F0] px-3 py-2 text-sm">
                <option value="user">user</option><option value="admin">admin</option>
              </select>
            </Field>
          </div>
          {error && <div className="mt-3 text-sm border border-[#E53E3E] bg-red-50 text-[#E53E3E] px-3 py-2">{error}</div>}
          <div className="mt-4 flex gap-2">
            <button onClick={create} data-testid="create-user-confirm" className="bg-[#002FA7] text-white px-5 py-2.5 text-sm font-semibold hover:bg-[#002080]">Create user</button>
            <button onClick={() => { setShowForm(false); setError(""); }} data-testid="cancel-user-form" className="border border-[#111827] px-5 py-2.5 text-sm font-semibold hover:bg-[#111827] hover:text-white">Cancel</button>
          </div>
        </div>
      )}

      <div className="mt-8 border border-[#E2E8F0] bg-white overflow-hidden">
        <table className="w-full text-sm" data-testid="users-table">
          <thead>
            <tr className="border-b-2 border-[#111827] text-[10px] uppercase tracking-[0.2em] text-left">
              <th className="px-4 py-3 font-semibold">User</th>
              <th className="px-4 py-3 font-semibold">Email</th>
              <th className="px-4 py-3 font-semibold">Role</th>
              <th className="px-4 py-3 font-semibold">Created</th>
              <th className="px-4 py-3 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u, i) => (
              <tr key={u.id} className="border-b border-[#E2E8F0] hover:bg-[#F8F9FA]" data-testid={`user-row-${u.id}`}>
                <td className="px-4 py-3 flex items-center gap-3">
                  <img src={AVATARS[i % AVATARS.length]} alt="" className="w-8 h-8 object-cover" />
                  <span className="font-semibold">{u.name || "—"}</span>
                </td>
                <td className="px-4 py-3 font-mono text-xs">{u.email}</td>
                <td className="px-4 py-3">
                  <span className={`text-[10px] uppercase tracking-[0.2em] font-semibold border px-2 py-0.5 ${u.role === "admin" ? "border-[#002FA7] text-[#002FA7] bg-[#EEF2FF]" : "border-gray-300 text-gray-700 bg-gray-50"}`}>
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-[#4B5563]">{new Date(u.created_at).toLocaleString()}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => remove(u.id)} data-testid={`delete-user-${u.id}`} className="p-2 hover:bg-red-50 text-[#E53E3E]"><Trash size={16} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-[0.2em] text-[#9CA3AF] block mb-2">{label}</label>
      {children}
    </div>
  );
}
