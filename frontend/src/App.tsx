import React, { useState, useEffect } from "react";
import { api } from "./services/api";
import { 
  Users, Plus, Upload, Trash2, ArrowRight, UserCheck, AlertTriangle, AlertOctagon, 
  CheckCircle, ArrowLeftRight, HelpCircle, LogOut, Check, RefreshCw, Info, Calendar, FileText
} from "lucide-react";

// Types
interface User {
  id: string;
  name: string;
  email: string;
}

interface Group {
  id: string;
  name: string;
  createdBy: string;
  memberships: {
    id: string;
    joinedAt: string;
    leftAt: string | null;
    user: User;
  }[];
}

interface Expense {
  id: string;
  title: string;
  description: string | null;
  amount: number;
  currency: string;
  exchangeRate: number;
  normalizedAmount: number;
  expenseDate: string;
  splitType: string;
  payer: User;
  participants: {
    user: User;
    shareAmount: number;
  }[];
}

interface Settlement {
  id: string;
  payer: User;
  receiver: User;
  amount: number;
  currency: string;
  settlementDate: string;
}

interface UserBalanceSummary {
  userId: string;
  userName: string;
  totalPaidExpenses: number;
  totalOwedExpenses: number;
  totalPaidSettlements: number;
  totalReceivedSettlements: number;
  netBalance: number;
  trace: {
    id: string;
    title?: string;
    payerName?: string;
    receiverName?: string;
    date: string;
    type: "EXPENSE" | "SETTLEMENT";
    amount: number;
    currency: string;
    originalAmount?: number;
    paidAmount: number;
    owedAmount?: number;
    receivedAmount?: number;
    netEffect: number;
  }[];
}

interface SimplifiedDebt {
  fromUser: string;
  toUser: string;
  amount: number;
}

interface ImportJob {
  id: string;
  rawFileName: string;
  rawFileHash: string;
  status: string;
  uploadedAt: string;
  summary: {
    rowsProcessed: number;
    expensesCreated: number;
    settlementsCreated: number;
  } | null;
}

interface ImportAnomaly {
  id: string;
  rowNumber: number;
  fingerprint: string;
  severity: "INFO" | "WARNING" | "ERROR" | "BLOCKING";
  anomalyType: string;
  description: string;
  rawRow: any;
  normalizedRow: any;
  status: string;
}

export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem("token"));
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [view, setView] = useState<"login" | "register" | "dashboard" | "group-detail" | "import">("login");
  
  // Auth Form State
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");

  // App Data State
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [newGroupName, setNewGroupName] = useState("");
  const [addMemberEmail, setAddMemberEmail] = useState("");
  const [addMemberJoinDate, setAddMemberJoinDate] = useState("");

  // Expenses & Settlements lists
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [balances, setBalances] = useState<{ summaries: UserBalanceSummary[]; simplifiedDebts: SimplifiedDebt[] } | null>(null);

  // Manual Creation State
  const [expTitle, setExpTitle] = useState("");
  const [expAmount, setExpAmount] = useState("");
  const [expCurrency, setExpCurrency] = useState("INR");
  const [expPaidBy, setExpPaidBy] = useState("");
  const [expDate, setExpDate] = useState(new Date().toISOString().split("T")[0]);
  const [expSplitType, setExpSplitType] = useState("equal");
  const [expSplitWith, setExpSplitWith] = useState<string[]>([]);
  const [expSplitDetails, setExpSplitDetails] = useState<{ [key: string]: string }>({});

  const [settlePayer, setSettlePayer] = useState("");
  const [settleReceiver, setSettleReceiver] = useState("");
  const [settleAmount, setSettleAmount] = useState("");
  const [settleDate, setSettleDate] = useState(new Date().toISOString().split("T")[0]);

  // Import State
  const [importJobs, setImportJobs] = useState<ImportJob[]>([]);
  const [activeImportJobId, setActiveImportJobId] = useState<string | null>(null);
  const [activeImportAnomalies, setActiveImportAnomalies] = useState<ImportAnomaly[]>([]);
  const [importResolutions, setImportResolutions] = useState<{ [fingerprint: string]: any }>({});
  const [importCsvContent, setImportCsvContent] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importStats, setImportStats] = useState<any | null>(null);
  const [importError, setImportError] = useState("");

  // Modal / Traceability State
  const [traceUser, setTraceUser] = useState<UserBalanceSummary | null>(null);

  // Check login session on load
  useEffect(() => {
    if (token) {
      localStorage.setItem("token", token);
      fetchCurrentUser();
    } else {
      localStorage.removeItem("token");
      setView("login");
    }
  }, [token]);

  const fetchCurrentUser = async () => {
    try {
      const res = await api.get("/auth/me");
      setCurrentUser(res.data.user);
      setView("dashboard");
      fetchGroups();
      fetchImportJobs();
    } catch (err) {
      handleLogout();
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    setToken(null);
    setCurrentUser(null);
    setView("login");
  };

  const handleAuth = async (type: "login" | "register") => {
    setAuthError("");
    try {
      const payload = type === "register" 
        ? { name: authName, email: authEmail, password: authPassword }
        : { email: authEmail, password: authPassword };
      
      const res = await api.post(`/auth/${type}`, payload);
      setToken(res.data.token);
      setAuthName("");
      setAuthEmail("");
      setAuthPassword("");
    } catch (err: any) {
      setAuthError(err.response?.data?.error || `Failed to ${type}`);
    }
  };

  const fetchGroups = async () => {
    try {
      const res = await api.get("/groups");
      setGroups(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchImportJobs = async () => {
    try {
      const res = await api.get("/imports/jobs");
      setImportJobs(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    try {
      await api.post("/groups", { name: newGroupName });
      setNewGroupName("");
      fetchGroups();
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddMember = async () => {
    if (!selectedGroupId || !addMemberEmail.trim()) return;
    try {
      await api.post(`/groups/${selectedGroupId}/members`, {
        email: addMemberEmail.trim(),
        joinedAt: addMemberJoinDate || undefined
      });
      setAddMemberEmail("");
      setAddMemberJoinDate("");
      fetchGroupDetails(selectedGroupId);
    } catch (err: any) {
      alert(err.response?.data?.error || "Failed to add member");
    }
  };

  const handleSoftDeleteMember = async (membershipId: string) => {
    if (!confirm("Are you sure you want to mark this member as left? This will preserve their historical data but exclude them from future splits.")) return;
    try {
      await api.delete(`/membership/${membershipId}`);
      if (selectedGroupId) fetchGroupDetails(selectedGroupId);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchGroupDetails = async (groupId: string) => {
    try {
      const gRes = await api.get(`/groups/${groupId}`);
      setSelectedGroup(gRes.data);
      
      const eRes = await api.get(`/expenses/group/${groupId}`);
      setExpenses(eRes.data);

      const sRes = await api.get(`/settlements/group/${groupId}`);
      setSettlements(sRes.data);

      const bRes = await api.get(`/balances/group/${groupId}`);
      setBalances(bRes.data);

      // Reset manual forms
      setExpTitle("");
      setExpAmount("");
      setExpPaidBy(gRes.data.memberships[0]?.user.id || "");
      setExpSplitWith(gRes.data.memberships.map((m: any) => m.user.id));
      setSettlePayer(gRes.data.memberships[0]?.user.id || "");
      setSettleReceiver(gRes.data.memberships[1]?.user.id || "");
      setSettleAmount("");
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddExpense = async () => {
    if (!selectedGroupId || !expTitle.trim() || !expAmount || !expPaidBy) return;
    
    // Parse split details values
    const parsedDetails: { [key: string]: number } = {};
    for (const key of Object.keys(expSplitDetails)) {
      parsedDetails[key] = parseFloat(expSplitDetails[key]) || 0;
    }

    try {
      await api.post("/expenses", {
        groupId: selectedGroupId,
        title: expTitle,
        amount: expAmount,
        currency: expCurrency,
        paidBy: expPaidBy,
        expenseDate: expDate,
        splitType: expSplitType,
        splitWith: expSplitWith,
        splitDetails: parsedDetails
      });
      fetchGroupDetails(selectedGroupId);
    } catch (err: any) {
      alert(err.response?.data?.error || "Failed to create expense");
    }
  };

  const handleDeleteExpense = async (expenseId: string) => {
    if (!confirm("Delete this expense?")) return;
    try {
      await api.delete(`/expenses/${expenseId}`);
      if (selectedGroupId) fetchGroupDetails(selectedGroupId);
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddSettlement = async () => {
    if (!selectedGroupId || !settlePayer || !settleReceiver || !settleAmount) return;
    try {
      await api.post("/settlements", {
        groupId: selectedGroupId,
        payerId: settlePayer,
        receiverId: settleReceiver,
        amount: settleAmount,
        settlementDate: settleDate
      });
      fetchGroupDetails(selectedGroupId);
    } catch (err: any) {
      alert(err.response?.data?.error || "Failed to record settlement");
    }
  };

  const handleDeleteSettlement = async (settlementId: string) => {
    if (!confirm("Delete this settlement record?")) return;
    try {
      await api.delete(`/settlements/${settlementId}`);
      if (selectedGroupId) fetchGroupDetails(selectedGroupId);
    } catch (err) {
      console.error(err);
    }
  };

  // CSV Import flow
  const handleCsvFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImportFile(file);
      const reader = new FileReader();
      reader.onload = (event) => {
        setImportCsvContent(event.target?.result as string || "");
      };
      reader.readAsText(file);
    }
  };

  const handleUploadCsv = async () => {
    if (!importFile || !importCsvContent || !selectedGroupId) return;
    setImportError("");
    setImportStats(null);
    try {
      const res = await api.post("/imports/upload", {
        filename: importFile.name,
        csvContent: importCsvContent,
        groupId: selectedGroupId
      });
      setActiveImportJobId(res.data.jobId);
      setActiveImportAnomalies(res.data.anomalies);
      
      // Initialize resolution state with default actions
      const initialResolutions: any = {};
      res.data.anomalies.forEach((a: ImportAnomaly) => {
        // Build empty resolution objects
        initialResolutions[a.fingerprint] = {
          anomalyType: a.fingerprint,
          resolutionAction: a.severity === "INFO" ? "ACCEPTED_WARNING" : null,
          resolutionNote: "",
          resolutionDetails: {}
        };
      });
      setImportResolutions(initialResolutions);
      setView("import");
    } catch (err: any) {
      setImportError(err.response?.data?.error || "Failed to analyze CSV file.");
    }
  };

  const handleResolveAnomaly = (fingerprint: string, action: string, details: any = {}) => {
    setImportResolutions(prev => ({
      ...prev,
      [fingerprint]: {
        ...prev[fingerprint],
        resolutionAction: action,
        resolutionDetails: {
          ...prev[fingerprint]?.resolutionDetails,
          ...details
        }
      }
    }));
  };

  const handleResolveNote = (fingerprint: string, note: string) => {
    setImportResolutions(prev => ({
      ...prev,
      [fingerprint]: {
        ...prev[fingerprint],
        resolutionNote: note
      }
    }));
  };

  const handleFinalizeImport = async () => {
    if (!activeImportJobId || !selectedGroupId) return;
    
    // Check if there are any PENDING resolutions for non-INFO severities
    const unresolved = activeImportAnomalies.some(a => {
      const res = importResolutions[a.fingerprint];
      return !res || res.resolutionAction === null;
    });

    if (unresolved) {
      alert("Please resolve all anomalies in the review queue before proceeding.");
      return;
    }

    try {
      const res = await api.post(`/imports/jobs/${activeImportJobId}/resolve`, {
        groupId: selectedGroupId,
        csvContent: importCsvContent,
        resolutions: Object.values(importResolutions)
      });
      setImportStats(res.data.summary);
      fetchImportJobs();
      fetchGroupDetails(selectedGroupId);
    } catch (err: any) {
      alert(err.response?.data?.error || "Import persistence failed");
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-950/60 backdrop-blur sticky top-0 z-40 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setView(token ? "dashboard" : "login")}>
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/20">
            S
          </div>
          <div>
            <h1 className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">RetiX Shared Expense</h1>
            <p className="text-xs text-slate-500 font-medium">Spreetail Internship Assessment</p>
          </div>
        </div>
        
        {currentUser && (
          <div className="flex items-center space-x-4">
            <span className="text-sm font-medium text-slate-400">Hi, <b className="text-slate-100">{currentUser.name}</b></span>
            <button 
              onClick={handleLogout}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 hover:text-red-400 text-slate-400 transition-all cursor-pointer"
              title="Logout"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        )}
      </header>

      {/* Main Content Area */}
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto">
        
        {/* VIEW: LOGIN */}
        {view === "login" && (
          <div className="max-w-md w-full mx-auto my-12 bg-slate-950/40 border border-slate-800/80 rounded-2xl p-8 shadow-xl">
            <h2 className="text-2xl font-bold text-center mb-2">Welcome Back</h2>
            <p className="text-slate-400 text-sm text-center mb-8">Access your shared expenses and imports</p>

            {authError && <div className="p-3 bg-red-950/40 border border-red-800 text-red-400 rounded-lg text-sm mb-4">{authError}</div>}

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wider">Email</label>
                <input 
                  type="email" 
                  value={authEmail} 
                  onChange={e => setAuthEmail(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 transition-colors" 
                  placeholder="name@example.com"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wider">Password</label>
                <input 
                  type="password" 
                  value={authPassword} 
                  onChange={e => setAuthPassword(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                  placeholder="••••••••"
                />
              </div>
              <button 
                onClick={() => handleAuth("login")}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 rounded-xl transition-all shadow-lg shadow-indigo-600/25 mt-6 cursor-pointer"
              >
                Log In
              </button>
            </div>
            
            <p className="text-sm text-slate-500 text-center mt-6">
              New here? <button onClick={() => { setView("register"); setAuthError(""); }} className="text-indigo-400 hover:underline font-medium">Create an account</button>
            </p>
          </div>
        )}

        {/* VIEW: REGISTER */}
        {view === "register" && (
          <div className="max-w-md w-full mx-auto my-12 bg-slate-950/40 border border-slate-800/80 rounded-2xl p-8 shadow-xl">
            <h2 className="text-2xl font-bold text-center mb-2">Create Account</h2>
            <p className="text-slate-400 text-sm text-center mb-8">Register to manage shared group accounts</p>

            {authError && <div className="p-3 bg-red-950/40 border border-red-800 text-red-400 rounded-lg text-sm mb-4">{authError}</div>}

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wider">Full Name</label>
                <input 
                  type="text" 
                  value={authName} 
                  onChange={e => setAuthName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 transition-colors" 
                  placeholder="Aisha"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wider">Email Address</label>
                <input 
                  type="email" 
                  value={authEmail} 
                  onChange={e => setAuthEmail(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 transition-colors" 
                  placeholder="aisha@example.com"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wider">Password</label>
                <input 
                  type="password" 
                  value={authPassword} 
                  onChange={e => setAuthPassword(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                  placeholder="••••••••"
                />
              </div>
              <button 
                onClick={() => handleAuth("register")}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 rounded-xl transition-all shadow-lg shadow-indigo-600/25 mt-6 cursor-pointer"
              >
                Register
              </button>
            </div>
            
            <p className="text-sm text-slate-500 text-center mt-6">
              Already have an account? <button onClick={() => { setView("login"); setAuthError(""); }} className="text-indigo-400 hover:underline font-medium">Log in</button>
            </p>
          </div>
        )}

        {/* VIEW: DASHBOARD */}
        {view === "dashboard" && (
          <div className="space-y-8 animate-fade-in">
            {/* Upper Section */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* Group list card */}
              <div className="md:col-span-2 bg-slate-950/40 border border-slate-800/80 rounded-2xl p-6 shadow-lg flex flex-col">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center space-x-2">
                    <Users className="w-5 h-5 text-indigo-400" />
                    <h3 className="font-bold text-lg">My Groups</h3>
                  </div>
                  <div className="flex space-x-2">
                    <input 
                      type="text" 
                      value={newGroupName}
                      onChange={e => setNewGroupName(e.target.value)}
                      className="bg-slate-900 border border-slate-800 px-3 py-1.5 text-sm rounded-lg focus:outline-none focus:border-indigo-500"
                      placeholder="New group name..."
                    />
                    <button 
                      onClick={handleCreateGroup}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 text-sm rounded-lg font-medium transition-all shadow shadow-indigo-600/20 cursor-pointer"
                    >
                      Create
                    </button>
                  </div>
                </div>

                {groups.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-12 text-slate-500">
                    <Users className="w-12 h-12 mb-3 stroke-1" />
                    <p className="text-sm">You are not in any sharing groups yet.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {groups.map(g => (
                      <div 
                        key={g.id} 
                        onClick={() => { setSelectedGroupId(g.id); fetchGroupDetails(g.id); setView("group-detail"); }}
                        className="p-5 bg-slate-900 border border-slate-800 rounded-xl hover:border-indigo-500 transition-all cursor-pointer group shadow"
                      >
                        <h4 className="font-bold text-slate-100 group-hover:text-indigo-400 transition-colors mb-1">{g.name}</h4>
                        <p className="text-xs text-slate-500 mb-3">{g.memberships.length} active members</p>
                        <div className="flex items-center justify-between">
                          <div className="flex -space-x-2">
                            {g.memberships.slice(0, 4).map(m => (
                              <div key={m.id} className="w-6 h-6 rounded-full bg-slate-800 border border-slate-950 flex items-center justify-center text-[10px] font-bold text-indigo-400" title={m.user.name}>
                                {m.user.name[0]}
                              </div>
                            ))}
                            {g.memberships.length > 4 && (
                              <div className="w-6 h-6 rounded-full bg-slate-800 border border-slate-950 flex items-center justify-center text-[10px] font-bold text-slate-400">
                                +{g.memberships.length - 4}
                              </div>
                            )}
                          </div>
                          <span className="text-xs font-semibold text-indigo-400 group-hover:translate-x-1 transition-transform flex items-center">
                            Open <ArrowRight className="w-3.5 h-3.5 ml-1" />
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Import History card */}
              <div className="bg-slate-950/40 border border-slate-800/80 rounded-2xl p-6 shadow-lg">
                <div className="flex items-center space-x-2 mb-6">
                  <FileText className="w-5 h-5 text-indigo-400" />
                  <h3 className="font-bold text-lg">CSV Imports</h3>
                </div>

                <div className="space-y-4 max-h-[300px] overflow-y-auto">
                  {importJobs.length === 0 ? (
                    <p className="text-sm text-slate-500 text-center py-8">No import history found.</p>
                  ) : (
                    importJobs.map(j => (
                      <div key={j.id} className="p-3.5 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-between text-xs">
                        <div className="space-y-1">
                          <p className="font-semibold truncate max-w-[150px]">{j.rawFileName}</p>
                          <p className="text-[10px] text-slate-500">{new Date(j.uploadedAt).toLocaleString()}</p>
                        </div>
                        <div className="text-right">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            j.status === "COMPLETED" ? "bg-green-950/50 border border-green-800 text-green-400" :
                            j.status === "REVIEW_REQUIRED" ? "bg-yellow-950/50 border border-yellow-800 text-yellow-400" :
                            "bg-slate-800 text-slate-400"
                          }`}>
                            {j.status}
                          </span>
                          {j.summary && (
                            <p className="text-[10px] text-slate-400 mt-1">
                              +{j.summary.expensesCreated} Exp, +{j.summary.settlementsCreated} Set
                            </p>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>
          </div>
        )}

        {/* VIEW: GROUP DETAILS */}
        {view === "group-detail" && selectedGroup && (
          <div className="space-y-8 animate-fade-in">
            {/* Back button / header */}
            <div className="flex items-center justify-between">
              <button 
                onClick={() => { setView("dashboard"); setSelectedGroupId(null); setSelectedGroup(null); fetchGroups(); }}
                className="text-slate-400 hover:text-slate-100 flex items-center text-sm font-semibold transition-colors cursor-pointer"
              >
                <ArrowRight className="w-4 h-4 mr-1 rotate-180" /> Back to Dashboard
              </button>
              <h2 className="text-2xl font-bold">{selectedGroup.name}</h2>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Left Column: Members, Net Balances, Debt Simplification */}
              <div className="lg:col-span-2 space-y-6">
                
                {/* Net Balances Section */}
                <div className="bg-slate-950/40 border border-slate-800/80 rounded-2xl p-6 shadow-lg">
                  <h3 className="font-bold text-lg mb-4 flex items-center space-x-2">
                    <ArrowLeftRight className="w-5 h-5 text-indigo-400" />
                    <span>Group Balances</span>
                  </h3>

                  {balances && balances.summaries.length > 0 ? (
                    <div className="space-y-3">
                      {balances.summaries.map(s => {
                        const isCreditor = s.netBalance > 0.01;
                        const isDebtor = s.netBalance < -0.01;
                        return (
                          <div 
                            key={s.userId}
                            onClick={() => setTraceUser(s)}
                            className="p-3.5 bg-slate-900 border border-slate-800 hover:border-indigo-500 rounded-xl flex items-center justify-between transition-all cursor-pointer shadow"
                          >
                            <div className="flex items-center space-x-3">
                              <div className="w-9 h-9 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-indigo-400">
                                {s.userName[0]}
                              </div>
                              <div>
                                <h4 className="font-bold text-sm text-slate-100">{s.userName}</h4>
                                <p className="text-[10px] text-slate-500">Click to view breakdown audit</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className={`font-extrabold text-sm ${
                                isCreditor ? "text-emerald-400" :
                                isDebtor ? "text-rose-400" :
                                "text-slate-400"
                              }`}>
                                {isCreditor ? "+" : ""}{s.netBalance.toLocaleString("en-IN", { style: "currency", currency: "INR" })}
                              </p>
                              <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">
                                {isCreditor ? "Owed to them" : isDebtor ? "They owe" : "Settled"}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">No balance summaries computed.</p>
                  )}
                </div>

                {/* Debt Simplification Card */}
                {balances && balances.simplifiedDebts.length > 0 && (
                  <div className="bg-slate-950/40 border border-slate-800/80 rounded-2xl p-6 shadow-lg">
                    <h3 className="font-bold text-lg mb-4 flex items-center space-x-2 text-emerald-400">
                      <CheckCircle className="w-5 h-5" />
                      <span>Debt Repayment Plan (Simplified)</span>
                    </h3>
                    <div className="space-y-2.5">
                      {balances.simplifiedDebts.map((d, idx) => (
                        <div key={idx} className="p-3 bg-emerald-950/10 border border-emerald-900/40 rounded-xl flex items-center justify-between text-sm">
                          <div className="flex items-center space-x-2.5">
                            <span className="font-semibold text-rose-400">{d.fromUser}</span>
                            <ArrowRight className="w-4 h-4 text-slate-500" />
                            <span className="font-semibold text-emerald-400">{d.toUser}</span>
                          </div>
                          <span className="font-bold text-emerald-400 bg-emerald-950/50 border border-emerald-800/40 px-2.5 py-1 rounded text-xs">
                            Pay {d.amount.toLocaleString("en-IN", { style: "currency", currency: "INR" })}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Expense List Card */}
                <div className="bg-slate-950/40 border border-slate-800/80 rounded-2xl p-6 shadow-lg">
                  <h3 className="font-bold text-lg mb-4">Expenses History</h3>
                  {expenses.length === 0 ? (
                    <p className="text-sm text-slate-500 py-4 text-center">No expenses logged yet.</p>
                  ) : (
                    <div className="divide-y divide-slate-800">
                      {expenses.map(e => (
                        <div key={e.id} className="py-3.5 flex items-center justify-between text-sm">
                          <div className="space-y-1">
                            <h4 className="font-bold text-slate-100">{e.title}</h4>
                            <p className="text-xs text-slate-500">
                              Paid by <b>{e.payer.name}</b> on {new Date(e.expenseDate).toLocaleDateString()}
                            </p>
                          </div>
                          <div className="flex items-center space-x-4">
                            <div className="text-right">
                              <p className="font-bold text-slate-100">
                                {e.normalizedAmount.toLocaleString("en-IN", { style: "currency", currency: "INR" })}
                              </p>
                              {e.currency !== "INR" && (
                                <p className="text-[10px] text-slate-500">
                                  {e.amount} {e.currency} (1 USD = 83 INR)
                                </p>
                              )}
                            </div>
                            <button 
                              onClick={() => handleDeleteExpense(e.id)}
                              className="p-1.5 rounded bg-slate-900 border border-slate-800 hover:bg-red-950/40 hover:border-red-950 text-slate-500 hover:text-red-400 transition-all cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>

              {/* Right Column: Add member, CSV Upload, Manual Add Transactions */}
              <div className="space-y-6">
                
                {/* CSV Importer Selector */}
                <div className="bg-gradient-to-br from-indigo-950/20 to-slate-950/40 border border-indigo-900/30 rounded-2xl p-6 shadow-lg">
                  <h3 className="font-bold text-lg mb-4 flex items-center space-x-2 text-indigo-400">
                    <Upload className="w-5 h-5" />
                    <span>Import spreadsheet CSV</span>
                  </h3>
                  
                  {importError && (
                    <div className="p-3 bg-red-950/40 border border-red-800 text-red-400 rounded-lg text-xs mb-4">
                      {importError}
                    </div>
                  )}

                  <div className="space-y-4">
                    <div className="border border-dashed border-slate-850 hover:border-indigo-500 p-4 rounded-xl flex flex-col items-center justify-center bg-slate-900/30 cursor-pointer relative">
                      <Upload className="w-8 h-8 text-slate-500 mb-2" />
                      <span className="text-xs text-slate-400 font-medium">
                        {importFile ? importFile.name : "Select expenses_export.csv"}
                      </span>
                      <input 
                        type="file" 
                        accept=".csv"
                        onChange={handleCsvFileChange}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                      />
                    </div>
                    {importFile && (
                      <button 
                        onClick={handleUploadCsv}
                        className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2 rounded-xl transition-all shadow shadow-indigo-600/20 cursor-pointer text-sm"
                      >
                        Analyze CSV & Preview Anomalies
                      </button>
                    )}
                  </div>
                </div>

                {/* Manage Members list */}
                <div className="bg-slate-950/40 border border-slate-800/80 rounded-2xl p-6 shadow-lg">
                  <h3 className="font-bold text-lg mb-4">Group Members</h3>
                  
                  {/* Add member form */}
                  <div className="space-y-3 mb-6 p-3 bg-slate-900 rounded-xl">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Add New Member</p>
                    <input 
                      type="email" 
                      value={addMemberEmail}
                      onChange={e => setAddMemberEmail(e.target.value)}
                      placeholder="Member email..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs focus:outline-none"
                    />
                    <div className="flex space-x-2">
                      <input 
                        type="date" 
                        value={addMemberJoinDate}
                        onChange={e => setAddMemberJoinDate(e.target.value)}
                        className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-400"
                        title="Join Date"
                      />
                      <button 
                        onClick={handleAddMember}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-3 py-1.5 text-xs rounded-lg cursor-pointer"
                      >
                        Add
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3 max-h-[300px] overflow-y-auto">
                    {selectedGroup.memberships.map(m => (
                      <div key={m.id} className="p-3 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-between text-xs">
                        <div className="space-y-1">
                          <h4 className="font-bold text-slate-200">{m.user.name}</h4>
                          <p className="text-[10px] text-slate-500">
                            Joined {new Date(m.joinedAt).toLocaleDateString()}
                            {m.leftAt && ` • Left ${new Date(m.leftAt).toLocaleDateString()}`}
                          </p>
                        </div>
                        {!m.leftAt && (
                          <button 
                            onClick={() => handleSoftDeleteMember(m.id)}
                            className="p-1 rounded bg-slate-950 hover:bg-red-950/40 text-slate-500 hover:text-red-400 border border-slate-800 cursor-pointer"
                            title="Mark as Left"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Manual Add Expense Form */}
                <div className="bg-slate-950/40 border border-slate-800/80 rounded-2xl p-6 shadow-lg">
                  <h3 className="font-bold text-base mb-4">Manual Expense</h3>
                  <div className="space-y-3 text-xs">
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-400 mb-1">Title</label>
                      <input 
                        type="text" 
                        value={expTitle}
                        onChange={e => setExpTitle(e.target.value)}
                        placeholder="February rent..."
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-400 mb-1">Amount</label>
                        <input 
                          type="number" 
                          value={expAmount}
                          onChange={e => setExpAmount(e.target.value)}
                          placeholder="Amount..."
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-400 mb-1">Currency</label>
                        <select 
                          value={expCurrency}
                          onChange={e => setExpCurrency(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-slate-400"
                        >
                          <option value="INR">INR</option>
                          <option value="USD">USD</option>
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-400 mb-1">Paid By</label>
                        <select 
                          value={expPaidBy}
                          onChange={e => setExpPaidBy(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-slate-400"
                        >
                          {selectedGroup.memberships.map(m => (
                            <option key={m.user.id} value={m.user.id}>{m.user.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-400 mb-1">Date</label>
                        <input 
                          type="date" 
                          value={expDate}
                          onChange={e => setExpDate(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-slate-400"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-400 mb-1">Split Type</label>
                      <select 
                        value={expSplitType}
                        onChange={e => setExpSplitType(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-slate-400"
                      >
                        <option value="equal">Equal Split</option>
                        <option value="percentage">Percentage Split</option>
                        <option value="exact">Exact Split</option>
                        <option value="share">Weight/Share Split</option>
                      </select>
                    </div>

                    <button 
                      onClick={handleAddExpense}
                      className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 rounded-lg cursor-pointer"
                    >
                      Save Expense
                    </button>
                  </div>
                </div>

                {/* Manual Add Settlement Form */}
                <div className="bg-slate-950/40 border border-slate-800/80 rounded-2xl p-6 shadow-lg">
                  <h3 className="font-bold text-base mb-4">Manual Settlement</h3>
                  <div className="space-y-3 text-xs">
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-400 mb-1">From (Payer)</label>
                      <select 
                        value={settlePayer}
                        onChange={e => setSettlePayer(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-slate-400"
                      >
                        {selectedGroup.memberships.map(m => (
                          <option key={m.user.id} value={m.user.id}>{m.user.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-400 mb-1">To (Receiver)</label>
                      <select 
                        value={settleReceiver}
                        onChange={e => setSettleReceiver(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-slate-400"
                      >
                        {selectedGroup.memberships.map(m => (
                          <option key={m.user.id} value={m.user.id}>{m.user.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-400 mb-1">Amount</label>
                        <input 
                          type="number" 
                          value={settleAmount}
                          onChange={e => setSettleAmount(e.target.value)}
                          placeholder="Amount..."
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-400 mb-1">Date</label>
                        <input 
                          type="date" 
                          value={settleDate}
                          onChange={e => setSettleDate(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-slate-400"
                        />
                      </div>
                    </div>
                    
                    <button 
                      onClick={handleAddSettlement}
                      className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 rounded-lg cursor-pointer"
                    >
                      Record Repayment
                    </button>
                  </div>
                </div>

              </div>

            </div>
          </div>
        )}

        {/* VIEW: CSV IMPORT ANOMALY REVIEW & PREVIEW QUEUE */}
        {view === "import" && selectedGroup && activeImportJobId && (
          <div className="space-y-8 animate-fade-in">
            {/* Header info */}
            <div className="flex items-center justify-between">
              <button 
                onClick={() => { setView("group-detail"); setImportStats(null); }}
                className="text-slate-400 hover:text-slate-100 flex items-center text-sm font-semibold transition-colors cursor-pointer"
              >
                <ArrowRight className="w-4 h-4 mr-1 rotate-180" /> Cancel and Back
              </button>
              <h2 className="text-xl font-extrabold flex items-center text-indigo-400">
                <AlertTriangle className="w-6 h-6 mr-2 animate-pulse" />
                Reviewing Import: {importFile?.name}
              </h2>
            </div>

            {importStats ? (
              /* Report view post-finalize */
              <div className="max-w-2xl w-full mx-auto bg-slate-950/40 border border-slate-800/80 rounded-2xl p-8 shadow-xl space-y-6 text-center">
                <CheckCircle className="w-16 h-16 text-emerald-400 mx-auto" />
                <div>
                  <h3 className="text-2xl font-bold mb-1">Import Job Finalized!</h3>
                  <p className="text-slate-400 text-sm">Every resolved record is committed securely in the database.</p>
                </div>

                <div className="grid grid-cols-3 gap-4 bg-slate-900/60 p-4 border border-slate-800/60 rounded-xl max-w-md mx-auto text-sm">
                  <div>
                    <p className="text-[10px] text-slate-500 font-bold uppercase">Rows Processed</p>
                    <p className="font-extrabold text-slate-100">{importStats.rowsProcessed}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500 font-bold uppercase">Expenses Created</p>
                    <p className="font-extrabold text-emerald-400">+{importStats.expensesCreated}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500 font-bold uppercase">Settlements Created</p>
                    <p className="font-extrabold text-indigo-400">+{importStats.settlementsCreated}</p>
                  </div>
                </div>

                <div className="flex justify-center space-x-3">
                  <button 
                    onClick={() => { setView("group-detail"); setImportStats(null); }}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-6 py-2.5 rounded-xl cursor-pointer shadow"
                  >
                    View Group Balances
                  </button>
                </div>
              </div>
            ) : (
              /* Main anomalies list queue view */
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Left Column: Anomalies list */}
                <div className="lg:col-span-2 space-y-4">
                  <h3 className="font-bold text-lg mb-2 flex items-center">
                    Anomalies Review Queue ({activeImportAnomalies.length} found)
                  </h3>

                  {activeImportAnomalies.length === 0 ? (
                    <div className="p-8 bg-slate-950/40 border border-slate-800/80 rounded-2xl text-center space-y-3">
                      <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto" />
                      <p className="font-semibold">No data anomalies detected!</p>
                      <p className="text-xs text-slate-400">This CSV is perfectly clean and ready to import.</p>
                    </div>
                  ) : (
                    activeImportAnomalies.map(a => {
                      const resolution = importResolutions[a.fingerprint];
                      const isResolved = resolution && resolution.resolutionAction !== null;
                      
                      return (
                        <div 
                          key={a.id} 
                          className={`p-5 rounded-xl border transition-all bg-slate-950/40 ${
                            isResolved ? "border-green-800/40 bg-green-950/5" :
                            a.severity === "BLOCKING" ? "border-red-900/50" :
                            a.severity === "ERROR" ? "border-orange-900/50" :
                            a.severity === "WARNING" ? "border-yellow-900/40" :
                            "border-slate-800"
                          }`}
                        >
                          <div className="flex items-start justify-between mb-3 text-xs">
                            <span className="font-bold text-slate-400">Row {a.rowNumber} • {a.anomalyType}</span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              a.severity === "BLOCKING" ? "bg-red-950 border border-red-950 text-red-400" :
                              a.severity === "ERROR" ? "bg-orange-950 border border-orange-950 text-orange-400" :
                              a.severity === "WARNING" ? "bg-yellow-950/60 border border-yellow-800 text-yellow-400" :
                              "bg-slate-800 text-slate-400"
                            }`}>
                              {a.severity}
                            </span>
                          </div>

                          <p className="text-sm font-semibold text-slate-200 mb-3">{a.description}</p>

                          {/* Interactive resolution controls based on type */}
                          <div className="bg-slate-900/40 p-4 border border-slate-850 rounded-xl space-y-3 text-xs mb-3">
                            <p className="text-[10px] text-slate-500 font-bold uppercase">Original raw row values</p>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-slate-400">
                              <div>Date: <b>{a.rawRow.date}</b></div>
                              <div>Description: <b>{a.rawRow.description}</b></div>
                              <div>Payer: <b>{a.rawRow.paid_by || "(empty)"}</b></div>
                              <div>Amount: <b>{a.rawRow.amount} {a.rawRow.currency}</b></div>
                            </div>
                          </div>

                          {/* Quick Action buttons */}
                          <div className="flex flex-wrap gap-2 text-xs">
                            {/* Missing Payer Resolution */}
                            {a.anomalyType === "MISSING_PAYER" && (
                              <>
                                {selectedGroup.memberships.map(m => (
                                  <button 
                                    key={m.id}
                                    onClick={() => handleResolveAnomaly(a.fingerprint, "MAPPED_USER", { from: "", to: m.user.name })}
                                    className={`px-3 py-1.5 rounded-lg border font-semibold cursor-pointer ${
                                      resolution?.resolutionDetails?.to === m.user.name
                                        ? "bg-green-600 border-green-500 text-white"
                                        : "bg-slate-900 hover:bg-slate-800 border-slate-800"
                                    }`}
                                  >
                                    Assign to {m.user.name}
                                  </button>
                                ))}
                              </>
                            )}

                            {/* Unknown User Resolution */}
                            {a.anomalyType === "UNKNOWN_USER" && (
                              <div className="space-y-2.5 w-full">
                                <p className="text-[10px] font-bold text-slate-400">Map this name to an existing database user:</p>
                                <div className="flex flex-wrap gap-2">
                                  {selectedGroup.memberships.map(m => {
                                    // Extract the unknown username from the description
                                    const match = a.description.match(/'(.+?)'/);
                                    const rawName = match ? match[1] : "";
                                    return (
                                      <button 
                                        key={m.id}
                                        onClick={() => handleResolveAnomaly(a.fingerprint, "MAPPED_USER", { from: rawName, to: m.user.name })}
                                        className={`px-3 py-1.5 rounded-lg border font-semibold cursor-pointer ${
                                          resolution?.resolutionDetails?.to === m.user.name
                                            ? "bg-green-600 border-green-500 text-white"
                                            : "bg-slate-900 hover:bg-slate-800 border-slate-800"
                                        }`}
                                      >
                                        Map to {m.user.name}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* Ambiguous Date Resolution */}
                            {a.anomalyType === "AMBIGUOUS_DATE" && (
                              <div className="space-y-2.5 w-full">
                                <p className="text-[10px] font-bold text-slate-400">Select Date Interpretation:</p>
                                <div className="flex space-x-3">
                                  {/* Derive option dates (e.g. 04-05-2026 -> April 5 or May 4) */}
                                  {(() => {
                                    const match = a.rawRow.date.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
                                    if (!match) return null;
                                    const d1 = `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
                                    const d2 = `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
                                    
                                    const opt1Label = new Date(d1).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
                                    const opt2Label = new Date(d2).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
                                    
                                    return (
                                      <>
                                        <button 
                                          onClick={() => handleResolveAnomaly(a.fingerprint, "ACCEPTED_WARNING", { selectedDate: d1 })}
                                          className={`px-3 py-1.5 rounded-lg border font-semibold cursor-pointer ${
                                            resolution?.resolutionDetails?.selectedDate === d1
                                              ? "bg-green-600 border-green-500 text-white"
                                              : "bg-slate-900 border-slate-800"
                                          }`}
                                        >
                                          {opt1Label} (DD-MM-YYYY)
                                        </button>
                                        <button 
                                          onClick={() => handleResolveAnomaly(a.fingerprint, "ACCEPTED_WARNING", { selectedDate: d2 })}
                                          className={`px-3 py-1.5 rounded-lg border font-semibold cursor-pointer ${
                                            resolution?.resolutionDetails?.selectedDate === d2
                                              ? "bg-green-600 border-green-500 text-white"
                                              : "bg-slate-900 border-slate-800"
                                          }`}
                                        >
                                          {opt2Label} (MM-DD-YYYY)
                                        </button>
                                      </>
                                    );
                                  })()}
                                </div>
                              </div>
                            )}

                            {/* Settlement Disguised as Expense Resolution */}
                            {a.anomalyType === "SETTLEMENT_DISGUISED_AS_EXPENSE" && (
                              <>
                                <button 
                                  onClick={() => handleResolveAnomaly(a.fingerprint, "CONVERTED_TO_SETTLEMENT")}
                                  className={`px-3 py-1.5 rounded-lg border font-semibold cursor-pointer ${
                                    resolution?.resolutionAction === "CONVERTED_TO_SETTLEMENT"
                                      ? "bg-indigo-600 border-indigo-500 text-white"
                                      : "bg-slate-900 border-slate-800 text-indigo-400 hover:bg-slate-800"
                                  }`}
                                >
                                  Yes, convert to Settlement
                                </button>
                                <button 
                                  onClick={() => handleResolveAnomaly(a.fingerprint, "ACCEPTED_WARNING")}
                                  className={`px-3 py-1.5 rounded-lg border font-semibold cursor-pointer ${
                                    resolution?.resolutionAction === "ACCEPTED_WARNING"
                                      ? "bg-slate-800 text-white"
                                      : "bg-slate-900 border-slate-800"
                                  }`}
                                >
                                  No, import as regular Expense
                                </button>
                              </>
                            )}

                            {/* Duplicate Detection Resolution */}
                            {a.anomalyType === "DUPLICATE" && (
                              <>
                                <button 
                                  onClick={() => handleResolveAnomaly(a.fingerprint, "REJECT_ROW")}
                                  className={`px-3 py-1.5 rounded-lg border font-semibold cursor-pointer ${
                                    resolution?.resolutionAction === "REJECT_ROW"
                                      ? "bg-red-600 border-red-500 text-white"
                                      : "bg-slate-900 border-slate-800 text-red-400 hover:bg-slate-850"
                                  }`}
                                >
                                  Reject duplicate row (Delete)
                                </button>
                                <button 
                                  onClick={() => handleResolveAnomaly(a.fingerprint, "APPROVED_DUPLICATE")}
                                  className={`px-3 py-1.5 rounded-lg border font-semibold cursor-pointer ${
                                    resolution?.resolutionAction === "APPROVED_DUPLICATE"
                                      ? "bg-green-600 border-green-500 text-white"
                                      : "bg-slate-900 border-slate-800"
                                  }`}
                                >
                                  Approve duplicate as valid
                                </button>
                              </>
                            )}

                            {/* Simple Warning Resolutions (INFO / general warnings) */}
                            {["MISSING_CURRENCY", "NEGATIVE_AMOUNT", "ZERO_AMOUNT", "MEMBERSHIP_VIOLATION"].includes(a.anomalyType) && (
                              <>
                                <button 
                                  onClick={() => handleResolveAnomaly(a.fingerprint, "ACCEPTED_WARNING")}
                                  className={`px-3 py-1.5 rounded-lg border font-semibold cursor-pointer ${
                                    resolution?.resolutionAction === "ACCEPTED_WARNING"
                                      ? "bg-green-600 border-green-500 text-white"
                                      : "bg-slate-900 border-slate-850"
                                  }`}
                                >
                                  Accept and continue
                                </button>
                                {a.anomalyType === "MEMBERSHIP_VIOLATION" && (
                                  <button 
                                    onClick={() => handleResolveAnomaly(a.fingerprint, "REJECT_ROW")}
                                    className={`px-3 py-1.5 rounded-lg border font-semibold cursor-pointer ${
                                      resolution?.resolutionAction === "REJECT_ROW"
                                        ? "bg-red-600 border-red-550 text-white"
                                        : "bg-slate-900 border-slate-850 text-red-400"
                                    }`}
                                  >
                                    Exclude row
                                  </button>
                                )}
                              </>
                            )}
                          </div>

                          {/* Audit Note text input */}
                          <div className="mt-3.5">
                            <input 
                              type="text"
                              value={resolution?.resolutionNote || ""}
                              onChange={e => handleResolveNote(a.fingerprint, e.target.value)}
                              placeholder="Add resolution details audit note..."
                              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs focus:outline-none"
                            />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Right Column: Preview Stats, Finalize controls */}
                <div className="bg-slate-950/40 border border-slate-800/80 rounded-2xl p-6 shadow-lg h-fit space-y-6">
                  <h3 className="font-bold text-lg">Verification Summary</h3>

                  <div className="space-y-3.5 text-xs text-slate-400">
                    <div className="flex justify-between">
                      <span>Total Anomalies Detected:</span>
                      <span className="font-bold text-slate-100">{activeImportAnomalies.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Resolved Items:</span>
                      <span className="font-bold text-green-400">
                        {Object.values(importResolutions).filter(r => r.resolutionAction !== null).length} / {activeImportAnomalies.length}
                      </span>
                    </div>
                  </div>

                  <hr className="border-slate-850" />

                  <button 
                    onClick={handleFinalizeImport}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold py-3 rounded-xl cursor-pointer text-sm shadow-lg shadow-indigo-600/20"
                  >
                    Resolve Anomalies & Finalize Import
                  </button>
                </div>

              </div>
            )}
          </div>
        )}

      </main>

      {/* Modal dialog: Traceability Card / Explainable Balance breakdown */}
      {traceUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-lg font-bold text-slate-100">Balance Breakdown: {traceUser.userName}</h3>
                <p className="text-xs text-slate-500">Trace log auditing how debt calculations were derived</p>
              </div>
              <button 
                onClick={() => setTraceUser(null)}
                className="text-slate-400 hover:text-slate-100 p-1.5 bg-slate-800 rounded-lg text-sm cursor-pointer"
              >
                Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {traceUser.trace.map((t, idx) => {
                const isExpense = t.type === "EXPENSE";
                const isSettlement = t.type === "SETTLEMENT";
                const net = t.netEffect;
                return (
                  <div key={idx} className="p-3 bg-slate-950/40 border border-slate-850 rounded-xl text-xs flex justify-between items-center">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className={`px-2 py-0.5 rounded-[4px] text-[8px] font-bold ${
                          isExpense ? "bg-indigo-950 text-indigo-400" : "bg-emerald-950 text-emerald-400"
                        }`}>
                          {t.type}
                        </span>
                        <h4 className="font-bold text-slate-200">
                          {isExpense ? t.title : `${t.payerName} → ${t.receiverName}`}
                        </h4>
                      </div>
                      <p className="text-[10px] text-slate-500">
                        {new Date(t.date).toLocaleDateString()} • Original: {t.originalAmount || t.amount} {t.currency}
                      </p>
                    </div>
                    
                    <div className="flex items-center space-x-4">
                      <div className="text-right space-y-0.5 text-slate-400">
                        {isExpense ? (
                          <>
                            <div>Paid: <b>{t.paidAmount.toLocaleString("en-IN", { style: "currency", currency: "INR" })}</b></div>
                            <div>Owed: <b>{t.owedAmount?.toLocaleString("en-IN", { style: "currency", currency: "INR" })}</b></div>
                          </>
                        ) : (
                          <>
                            {t.paidAmount > 0 && <div>Paid back: <b>{t.paidAmount.toLocaleString("en-IN", { style: "currency", currency: "INR" })}</b></div>}
                            {t.receivedAmount !== undefined && t.receivedAmount > 0 && <div>Received: <b>{t.receivedAmount.toLocaleString("en-IN", { style: "currency", currency: "INR" })}</b></div>}
                          </>
                        )}
                      </div>
                      
                      <span className={`font-extrabold text-sm min-w-[80px] text-right ${
                        net > 0 ? "text-emerald-400" :
                        net < 0 ? "text-rose-400" :
                        "text-slate-400"
                      }`}>
                        {net > 0 ? "+" : ""}{net.toLocaleString("en-IN", { style: "currency", currency: "INR" })}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <hr className="border-slate-850 my-4" />

            <div className="flex justify-between items-center">
              <span className="text-sm font-bold text-slate-400">Final Net Balance:</span>
              <span className={`text-lg font-extrabold ${
                traceUser.netBalance > 0 ? "text-emerald-400" :
                traceUser.netBalance < 0 ? "text-rose-400" :
                "text-slate-400"
              }`}>
                {traceUser.netBalance > 0 ? "+" : ""}{traceUser.netBalance.toLocaleString("en-IN", { style: "currency", currency: "INR" })}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
