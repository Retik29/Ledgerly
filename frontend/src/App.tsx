import React, { useState, useEffect, useMemo } from "react";
import { api } from "./services/api";
import { 
  Users, Plus, Upload, Trash2, ArrowRight, UserCheck, AlertTriangle, AlertOctagon, 
  CheckCircle, ArrowLeftRight, HelpCircle, LogOut, Check, RefreshCw, Info, Calendar, FileText,
  Search, Eye, ShieldAlert, History, Activity, Database, CheckSquare, Layers
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
    anomaliesFound: number;
    errorsFound: number;
  } | null;
  anomalies?: ImportAnomaly[];
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
  resolutionAction?: string | null;
  resolutionNote?: string | null;
}

interface AuditLog {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  performedBy: string | null;
  beforeState: any;
  afterState: any;
  createdAt: string;
}

export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem("token"));
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [view, setView] = useState<"login" | "register" | "dashboard" | "group-detail" | "import" | "admin-demo">("login");
  
  // Tab within group details page
  const [groupTab, setGroupTab] = useState<"overview" | "expenses" | "settlements" | "members" | "balances" | "imports">("overview");

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

  // Diagnostics Panel Stage Logging
  const [diagnosticsLogs, setDiagnosticsLogs] = useState<{ stage: string; timestamp: string; details: any }[]>([]);

  // Admin Demo State
  const [adminDemoData, setAdminDemoData] = useState<{
    importJobs: ImportJob[];
    auditLogs: AuditLog[];
    memberships: any[];
  } | null>(null);

  // Modal / Traceability State
  const [traceUser, setTraceUser] = useState<UserBalanceSummary | null>(null);

  // Table Search and Sort State
  const [expenseSearch, setExpenseSearch] = useState("");
  const [expenseSortField, setExpenseSortField] = useState<"date" | "amount" | "title">("date");
  const [expenseSortOrder, setExpenseSortOrder] = useState<"asc" | "desc">("desc");

  // Hash-based Admin Demo Route Router
  useEffect(() => {
    const handleHash = () => {
      if (window.location.hash === "#/admin/demo") {
        if (token) {
          setView("admin-demo");
          fetchAdminDemoData();
        } else {
          setView("login");
        }
      }
    };
    window.addEventListener("hashchange", handleHash);
    handleHash(); // initial check
    return () => window.removeEventListener("hashchange", handleHash);
  }, [token]);

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
      if (window.location.hash === "#/admin/demo") {
        setView("admin-demo");
        fetchAdminDemoData();
      } else {
        setView("dashboard");
      }
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
    window.location.hash = "";
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
      setAuthError(err.response?.data?.message || err.response?.data?.error || `Failed to ${type}`);
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

  const fetchAdminDemoData = async () => {
    try {
      const res = await api.get("/admin/demo");
      setAdminDemoData(res.data);
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
      alert(err.response?.data?.message || err.response?.data?.error || "Failed to add member");
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
      alert(err.response?.data?.message || err.response?.data?.error || "Failed to create expense");
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
      alert(err.response?.data?.message || err.response?.data?.error || "Failed to record settlement");
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
    setDiagnosticsLogs([]); // clear log panel

    // Initialize diagnostic stage log
    addDiagnosticsLog("REQUEST_VALIDATION", { filename: importFile.name, size: importFile.size });

    try {
      addDiagnosticsLog("DUPLICATE_CHECK", { checkingDb: true });
      addDiagnosticsLog("CSV_PARSER", { parsing: true });

      const res = await api.post("/imports/upload", {
        filename: importFile.name,
        csvContent: importCsvContent,
        groupId: selectedGroupId
      });

      addDiagnosticsLog("ANOMALY_ENGINE", {
        anomaliesCount: res.data.anomaliesCount,
        anomalies: res.data.anomalies
      });

      setActiveImportJobId(res.data.jobId);
      setActiveImportAnomalies(res.data.anomalies);
      
      // Initialize resolutions
      const initialResolutions: any = {};
      res.data.anomalies.forEach((a: ImportAnomaly) => {
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
      const errData = err.response?.data;
      addDiagnosticsLog(errData?.stage || "SERVER_CRASH", { error: errData?.message || err.message });
      setImportError(errData?.message || "Failed to analyze CSV file.");
    }
  };

  const addDiagnosticsLog = (stage: string, details: any) => {
    setDiagnosticsLogs(prev => [
      ...prev,
      { stage, timestamp: new Date().toLocaleTimeString(), details }
    ]);
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
      addDiagnosticsLog("PERSISTENCE", { finalizing: true });
      const res = await api.post(`/imports/jobs/${activeImportJobId}/resolve`, {
        groupId: selectedGroupId,
        csvContent: importCsvContent,
        resolutions: Object.values(importResolutions)
      });
      setImportStats(res.data.summary);
      addDiagnosticsLog("COMPLETED", res.data.summary);
      fetchImportJobs();
      fetchGroupDetails(selectedGroupId);
    } catch (err: any) {
      const errData = err.response?.data;
      addDiagnosticsLog(errData?.stage || "PERSISTENCE_FAILED", { error: errData?.message || err.message });
      alert(errData?.message || "Import persistence failed");
    }
  };

  // Memoized filtered and sorted expenses
  const processedExpenses = useMemo(() => {
    let result = [...expenses];
    if (expenseSearch.trim()) {
      const query = expenseSearch.toLowerCase();
      result = result.filter(e => 
        e.title.toLowerCase().includes(query) || 
        e.payer.name.toLowerCase().includes(query)
      );
    }

    result.sort((a, b) => {
      let aVal: any = a[expenseSortField === "date" ? "expenseDate" : expenseSortField];
      let bVal: any = b[expenseSortField === "date" ? "expenseDate" : expenseSortField];
      
      if (expenseSortField === "date") {
        aVal = new Date(aVal).getTime();
        bVal = new Date(bVal).getTime();
      }

      if (aVal < bVal) return expenseSortOrder === "asc" ? -1 : 1;
      if (aVal > bVal) return expenseSortOrder === "asc" ? 1 : -1;
      return 0;
    });

    return result;
  }, [expenses, expenseSearch, expenseSortField, expenseSortOrder]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans antialiased selection:bg-blue-600 selection:text-white">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white sticky top-0 z-40 px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center space-x-3 cursor-pointer" onClick={() => { setView(token ? "dashboard" : "login"); window.location.hash = ""; }}>
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center font-bold text-white shadow-sm">
            S
          </div>
          <div>
            <h1 className="font-extrabold text-lg tracking-tight text-slate-900">Shared Expense Manager</h1>
            <p className="text-xs text-slate-500 font-medium">Spreetail Internship Assessment</p>
          </div>
        </div>
        
        <div className="flex items-center space-x-4">
          {currentUser && (
            <>
              <button 
                onClick={() => { setView("admin-demo"); window.location.hash = "#/admin/demo"; }}
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all cursor-pointer flex items-center ${
                  view === "admin-demo"
                    ? "bg-blue-50 border-blue-200 text-blue-700 font-bold"
                    : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                <Layers className="w-3.5 h-3.5 mr-1" /> Interview Demo Mode
              </button>
              <span className="text-sm font-medium text-slate-500">Hi, <b className="text-slate-900">{currentUser.name}</b></span>
              <button 
                onClick={handleLogout}
                className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 hover:text-red-600 text-slate-500 transition-all cursor-pointer"
                title="Logout"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </>
          )}
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto p-6 md:p-8">
        
        {/* VIEW: LOGIN */}
        {view === "login" && (
          <div className="max-w-md w-full mx-auto my-12 bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
            <h2 className="text-2xl font-bold text-slate-900 text-center mb-1">Welcome Back</h2>
            <p className="text-slate-500 text-sm text-center mb-8">Access your shared expenses and imports</p>

            {authError && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm mb-4">{authError}</div>}

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">Email</label>
                <input 
                  type="email" 
                  value={authEmail} 
                  onChange={e => setAuthEmail(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600" 
                  placeholder="name@example.com"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">Password</label>
                <input 
                  type="password" 
                  value={authPassword} 
                  onChange={e => setAuthPassword(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                  placeholder="••••••••"
                />
              </div>
              <button 
                onClick={() => handleAuth("login")}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-all shadow-sm mt-6 cursor-pointer"
              >
                Log In
              </button>
            </div>
            
            <p className="text-sm text-slate-500 text-center mt-6">
              New here? <button onClick={() => { setView("register"); setAuthError(""); }} className="text-blue-600 hover:underline font-medium">Create an account</button>
            </p>
          </div>
        )}

        {/* VIEW: REGISTER */}
        {view === "register" && (
          <div className="max-w-md w-full mx-auto my-12 bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
            <h2 className="text-2xl font-bold text-slate-900 text-center mb-1">Create Account</h2>
            <p className="text-slate-500 text-sm text-center mb-8">Register to manage shared group accounts</p>

            {authError && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm mb-4">{authError}</div>}

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">Full Name</label>
                <input 
                  type="text" 
                  value={authName} 
                  onChange={e => setAuthName(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600" 
                  placeholder="Aisha"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">Email Address</label>
                <input 
                  type="email" 
                  value={authEmail} 
                  onChange={e => setAuthEmail(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600" 
                  placeholder="aisha@example.com"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wider">Password</label>
                <input 
                  type="password" 
                  value={authPassword} 
                  onChange={e => setAuthPassword(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                  placeholder="••••••••"
                />
              </div>
              <button 
                onClick={() => handleAuth("register")}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-all shadow-sm mt-6 cursor-pointer"
              >
                Register
              </button>
            </div>
            
            <p className="text-sm text-slate-500 text-center mt-6">
              Already have an account? <button onClick={() => { setView("login"); setAuthError(""); }} className="text-blue-600 hover:underline font-medium">Log in</button>
            </p>
          </div>
        )}

        {/* VIEW: DASHBOARD */}
        {view === "dashboard" && (
          <div className="space-y-8">
            {/* KPI Cards Header */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-5 bg-white border border-slate-200 rounded-xl shadow-sm flex items-center space-x-4">
                <div className="p-3 bg-blue-50 text-blue-600 rounded-lg"><Users className="w-5 h-5" /></div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Groups</p>
                  <p className="font-extrabold text-xl">{groups.length}</p>
                </div>
              </div>
              <div className="p-5 bg-white border border-slate-200 rounded-xl shadow-sm flex items-center space-x-4">
                <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg"><ArrowLeftRight className="w-5 h-5" /></div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Expenses Created</p>
                  <p className="font-extrabold text-xl">
                    {groups.reduce((acc, g) => acc + (g as any).expenses?.length || 0, 0)}
                  </p>
                </div>
              </div>
              <div className="p-5 bg-white border border-slate-200 rounded-xl shadow-sm flex items-center space-x-4">
                <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg"><CheckSquare className="w-5 h-5" /></div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Settlements</p>
                  <p className="font-extrabold text-xl">
                    {groups.reduce((acc, g) => acc + (g as any).settlements?.length || 0, 0)}
                  </p>
                </div>
              </div>
              <div className="p-5 bg-white border border-slate-200 rounded-xl shadow-sm flex items-center space-x-4">
                <div className="p-3 bg-purple-50 text-purple-600 rounded-lg"><FileText className="w-5 h-5" /></div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Import Jobs</p>
                  <p className="font-extrabold text-xl">{importJobs.length}</p>
                </div>
              </div>
            </div>

            {/* Middle Section grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Groups listing */}
              <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="font-bold text-base text-slate-800 flex items-center">
                    <Users className="w-4 h-4 mr-2 text-slate-500" /> My Groups
                  </h3>
                  <div className="flex space-x-2">
                    <input 
                      type="text" 
                      value={newGroupName}
                      onChange={e => setNewGroupName(e.target.value)}
                      className="bg-white border border-slate-300 px-3 py-1.5 text-xs rounded-lg focus:outline-none focus:border-blue-600 text-slate-800"
                      placeholder="New group name..."
                    />
                    <button 
                      onClick={handleCreateGroup}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-1.5 text-xs rounded-lg font-medium transition-colors shadow-sm cursor-pointer"
                    >
                      Create
                    </button>
                  </div>
                </div>

                {groups.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-12 text-slate-400">
                    <Users className="w-10 h-10 mb-2 stroke-1" />
                    <p className="text-xs">No sharing groups found.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {groups.map(g => (
                      <div 
                        key={g.id} 
                        onClick={() => { setSelectedGroupId(g.id); fetchGroupDetails(g.id); setGroupTab("overview"); setView("group-detail"); }}
                        className="p-5 bg-white border border-slate-200 rounded-xl hover:border-blue-600 hover:shadow transition-all cursor-pointer group flex flex-col justify-between"
                      >
                        <div>
                          <h4 className="font-bold text-slate-800 group-hover:text-blue-600 transition-colors mb-1">{g.name}</h4>
                          <p className="text-xs text-slate-500 mb-4">{g.memberships.length} members active</p>
                        </div>
                        <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                          <div className="flex -space-x-1.5">
                            {g.memberships.slice(0, 4).map(m => (
                              <div key={m.id} className="w-6 h-6 rounded-full bg-slate-100 border border-white flex items-center justify-center text-[10px] font-bold text-blue-600" title={m.user.name}>
                                {m.user.name[0]}
                              </div>
                            ))}
                            {g.memberships.length > 4 && (
                              <div className="w-6 h-6 rounded-full bg-slate-100 border border-white flex items-center justify-center text-[10px] font-bold text-slate-500">
                                +{g.memberships.length - 4}
                              </div>
                            )}
                          </div>
                          <span className="text-xs font-semibold text-blue-600 group-hover:translate-x-1 transition-transform flex items-center">
                            Open <ArrowRight className="w-3.5 h-3.5 ml-1" />
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent Imports */}
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                <h3 className="font-bold text-base text-slate-800 mb-4 flex items-center">
                  <FileText className="w-4 h-4 mr-2 text-slate-500" /> Recent Imports
                </h3>
                <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
                  {importJobs.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-8">No spreadsheets imported.</p>
                  ) : (
                    importJobs.map(j => (
                      <div key={j.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between text-xs">
                        <div className="space-y-0.5">
                          <p className="font-semibold text-slate-800 truncate max-w-[150px]">{j.rawFileName}</p>
                          <p className="text-[10px] text-slate-400">{new Date(j.uploadedAt).toLocaleDateString()}</p>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          j.status === "COMPLETED" ? "bg-green-100 text-green-800" :
                          j.status === "REVIEW_REQUIRED" ? "bg-amber-100 text-amber-800" :
                          "bg-slate-100 text-slate-600"
                        }`}>
                          {j.status}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>

            {/* Recent Activity timeline mock */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
              <h3 className="font-bold text-base text-slate-800 mb-4 flex items-center">
                <Activity className="w-4 h-4 mr-2 text-slate-500" /> Activity Log
              </h3>
              <div className="space-y-4">
                <div className="flex items-start space-x-3 text-xs">
                  <div className="w-2 h-2 rounded-full bg-blue-600 mt-1.5"></div>
                  <div>
                    <p className="text-slate-800 font-medium">Database schema compatibility verified successfully.</p>
                    <p className="text-[10px] text-slate-400">June 13, 2026</p>
                  </div>
                </div>
                <div className="flex items-start space-x-3 text-xs">
                  <div className="w-2 h-2 rounded-full bg-emerald-600 mt-1.5"></div>
                  <div>
                    <p className="text-slate-800 font-medium">Historical member periods seeded: Aisha, Rohan, Priya, Meera, Sam, Dev.</p>
                    <p className="text-[10px] text-slate-400">June 13, 2026</p>
                  </div>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* VIEW: GROUP DETAIL (TABS-BASED REDESIGN) */}
        {view === "group-detail" && selectedGroup && (
          <div className="space-y-6">
            
            {/* Header / Nav */}
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <button 
                onClick={() => { setView("dashboard"); setSelectedGroupId(null); setSelectedGroup(null); fetchGroups(); }}
                className="text-slate-500 hover:text-slate-800 flex items-center text-sm font-semibold transition-colors cursor-pointer"
              >
                <ArrowRight className="w-4 h-4 mr-1 rotate-180" /> Back to Dashboard
              </button>
              <div className="text-right">
                <h2 className="text-xl font-bold text-slate-900">{selectedGroup.name}</h2>
                <p className="text-xs text-slate-500">Group ID: {selectedGroup.id}</p>
              </div>
            </div>

            {/* Tab selection */}
            <div className="flex border-b border-slate-200 space-x-6 text-sm">
              {[
                { key: "overview", label: "Overview" },
                { key: "expenses", label: "Expenses" },
                { key: "settlements", label: "Settlements" },
                { key: "members", label: "Members" },
                { key: "balances", label: "Balances" }
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setGroupTab(tab.key as any)}
                  className={`pb-3 border-b-2 font-semibold transition-all cursor-pointer ${
                    groupTab === tab.key
                      ? "border-blue-600 text-blue-600"
                      : "border-transparent text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* TAB CONTENT: OVERVIEW */}
            {groupTab === "overview" && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                  {/* Group Summary card */}
                  <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
                    <h3 className="font-bold text-base text-slate-850">Group Summary</h3>
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div className="p-3 bg-slate-50 border border-slate-100 rounded-lg">
                        <p className="text-[10px] text-slate-400 font-bold uppercase">Members</p>
                        <p className="text-lg font-extrabold text-slate-800">{selectedGroup.memberships.length}</p>
                      </div>
                      <div className="p-3 bg-slate-50 border border-slate-100 rounded-lg">
                        <p className="text-[10px] text-slate-400 font-bold uppercase">Expenses</p>
                        <p className="text-lg font-extrabold text-slate-800">{expenses.length}</p>
                      </div>
                      <div className="p-3 bg-slate-50 border border-slate-100 rounded-lg">
                        <p className="text-[10px] text-slate-400 font-bold uppercase">Settlements</p>
                        <p className="text-lg font-extrabold text-slate-800">{settlements.length}</p>
                      </div>
                    </div>
                  </div>

                  {/* Quick CSV Import Trigger */}
                  <div className="bg-blue-50/50 border border-blue-200/50 rounded-xl p-6 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div>
                      <h4 className="font-bold text-blue-900 text-sm">Upload spreadsheet data</h4>
                      <p className="text-xs text-blue-700/80 mt-0.5">Import raw csv and run pluggable anomaly engine verification checks.</p>
                    </div>
                    <div className="flex items-center space-x-3 w-full sm:w-auto">
                      <input 
                        type="file" 
                        accept=".csv"
                        id="csv-file-quick"
                        onChange={handleCsvFileChange}
                        className="hidden"
                      />
                      <label 
                        htmlFor="csv-file-quick"
                        className="flex-1 sm:flex-none bg-white border border-slate-350 hover:bg-slate-50 text-slate-700 px-4 py-2 text-xs font-semibold rounded-lg cursor-pointer text-center"
                      >
                        {importFile ? importFile.name : "Select CSV file"}
                      </label>
                      {importFile && (
                        <button
                          onClick={handleUploadCsv}
                          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-xs font-semibold rounded-lg cursor-pointer transition-all"
                        >
                          Analyze
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right side widgets: Mini Member logs */}
                <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm h-fit">
                  <h4 className="font-bold text-slate-800 text-sm mb-4">Active Members</h4>
                  <div className="space-y-3">
                    {selectedGroup.memberships.map(m => (
                      <div key={m.id} className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-700">{m.user.name}</span>
                        <span className={`px-2 py-0.5 rounded-[4px] text-[10px] font-bold ${
                          m.leftAt ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"
                        }`}>
                          {m.leftAt ? "Inactive" : "Active"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TAB CONTENT: EXPENSES (STANDARDIZED DATA TABLE) */}
            {groupTab === "expenses" && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Table list */}
                <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
                  {/* Table search / filters */}
                  <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50/20">
                    <div className="relative w-full sm:max-w-xs">
                      <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                      <input 
                        type="text" 
                        value={expenseSearch}
                        onChange={e => setExpenseSearch(e.target.value)}
                        placeholder="Search title, payer..."
                        className="bg-white border border-slate-300 w-full pl-9 pr-4 py-2 text-xs rounded-lg focus:outline-none"
                      />
                    </div>
                    <div className="flex space-x-3 text-xs text-slate-650 w-full sm:w-auto justify-end">
                      <button 
                        onClick={() => {
                          setExpenseSortField("date");
                          setExpenseSortOrder(prev => prev === "asc" ? "desc" : "asc");
                        }}
                        className={`px-2.5 py-1.5 border rounded-lg flex items-center font-semibold cursor-pointer ${
                          expenseSortField === "date" ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-white border-slate-200"
                        }`}
                      >
                        Date {expenseSortField === "date" && (expenseSortOrder === "asc" ? "▲" : "▼")}
                      </button>
                      <button 
                        onClick={() => {
                          setExpenseSortField("amount");
                          setExpenseSortOrder(prev => prev === "asc" ? "desc" : "asc");
                        }}
                        className={`px-2.5 py-1.5 border rounded-lg flex items-center font-semibold cursor-pointer ${
                          expenseSortField === "amount" ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-white border-slate-200"
                        }`}
                      >
                        Amount {expenseSortField === "amount" && (expenseSortOrder === "asc" ? "▲" : "▼")}
                      </button>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider text-[10px] border-b border-slate-200">
                          <th className="py-3 px-4">Date</th>
                          <th className="py-3 px-4">Title</th>
                          <th className="py-3 px-4 text-right">Amount (INR)</th>
                          <th className="py-3 px-4">Paid By</th>
                          <th className="py-3 px-4">Type</th>
                          <th className="py-3 px-4"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {processedExpenses.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="py-8 text-center text-slate-400 text-xs">No expenses matched filters.</td>
                          </tr>
                        ) : (
                          processedExpenses.map(e => (
                            <tr key={e.id} className="border-b border-slate-100 hover:bg-slate-50/50 text-xs text-slate-700">
                              <td className="py-3 px-4 whitespace-nowrap">{new Date(e.expenseDate).toLocaleDateString()}</td>
                              <td className="py-3 px-4 font-semibold text-slate-900">{e.title}</td>
                              <td className="py-3 px-4 text-right font-bold text-slate-900">
                                {e.normalizedAmount.toLocaleString("en-IN", { style: "currency", currency: "INR" })}
                              </td>
                              <td className="py-3 px-4">{e.payer.name}</td>
                              <td className="py-3 px-4">
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-650 uppercase">
                                  {e.splitType}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-right">
                                <button 
                                  onClick={() => handleDeleteExpense(e.id)}
                                  className="p-1 rounded hover:bg-red-50 hover:text-red-600 border border-transparent hover:border-red-200 text-slate-400 transition-all cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Form to add manual Expense */}
                <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm h-fit">
                  <h3 className="font-bold text-base text-slate-800 mb-4">Add Manual Expense</h3>
                  <div className="space-y-4 text-xs">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1">Title</label>
                      <input 
                        type="text" 
                        value={expTitle}
                        onChange={e => setExpTitle(e.target.value)}
                        placeholder="February rent..."
                        className="w-full bg-white border border-slate-350 rounded-lg px-3 py-2"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-1">Amount</label>
                        <input 
                          type="number" 
                          value={expAmount}
                          onChange={e => setExpAmount(e.target.value)}
                          placeholder="Amount..."
                          className="w-full bg-white border border-slate-350 rounded-lg px-3 py-2"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-1">Currency</label>
                        <select 
                          value={expCurrency}
                          onChange={e => setExpCurrency(e.target.value)}
                          className="w-full bg-white border border-slate-355 rounded-lg px-3 py-2 text-slate-700"
                        >
                          <option value="INR">INR</option>
                          <option value="USD">USD</option>
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-1">Paid By</label>
                        <select 
                          value={expPaidBy}
                          onChange={e => setExpPaidBy(e.target.value)}
                          className="w-full bg-white border border-slate-355 rounded-lg px-3 py-2 text-slate-700"
                        >
                          {selectedGroup.memberships.map(m => (
                            <option key={m.user.id} value={m.user.id}>{m.user.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-1">Date</label>
                        <input 
                          type="date" 
                          value={expDate}
                          onChange={e => setExpDate(e.target.value)}
                          className="w-full bg-white border border-slate-355 rounded-lg px-3 py-2 text-slate-700"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1">Split Type</label>
                      <select 
                        value={expSplitType}
                        onChange={e => setExpSplitType(e.target.value)}
                        className="w-full bg-white border border-slate-355 rounded-lg px-3 py-2 text-slate-700"
                      >
                        <option value="equal">Equal Split</option>
                        <option value="percentage">Percentage Split</option>
                        <option value="exact">Exact Split</option>
                        <option value="share">Weight/Share Split</option>
                      </select>
                    </div>

                    <button 
                      onClick={handleAddExpense}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-lg cursor-pointer transition-colors shadow-sm"
                    >
                      Save Expense
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB CONTENT: SETTLEMENTS */}
            {groupTab === "settlements" && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider text-[10px] border-b border-slate-200">
                        <th className="py-3 px-4">Date</th>
                        <th className="py-3 px-4">From (Payer)</th>
                        <th className="py-3 px-4">To (Receiver)</th>
                        <th className="py-3 px-4 text-right">Amount (INR)</th>
                        <th className="py-3 px-4"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {settlements.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-slate-400 text-xs">No settlements recorded.</td>
                        </tr>
                      ) : (
                        settlements.map(s => (
                          <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50/50 text-xs text-slate-700">
                            <td className="py-3 px-4 whitespace-nowrap">{new Date(s.settlementDate).toLocaleDateString()}</td>
                            <td className="py-3 px-4 font-semibold text-slate-900">{s.payer.name}</td>
                            <td className="py-3 px-4 font-semibold text-slate-900">{s.receiver.name}</td>
                            <td className="py-3 px-4 text-right font-extrabold text-emerald-600">
                              {s.amount.toLocaleString("en-IN", { style: "currency", currency: "INR" })}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <button 
                                onClick={() => handleDeleteSettlement(s.id)}
                                className="p-1 rounded hover:bg-red-50 hover:text-red-600 border border-transparent hover:border-red-200 text-slate-400 transition-all cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Form to add manual Settlement */}
                <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm h-fit">
                  <h3 className="font-bold text-base text-slate-800 mb-4">Record Repayment</h3>
                  <div className="space-y-4 text-xs">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1">From (Payer)</label>
                      <select 
                        value={settlePayer}
                        onChange={e => setSettlePayer(e.target.value)}
                        className="w-full bg-white border border-slate-355 rounded-lg px-3 py-2 text-slate-700"
                      >
                        {selectedGroup.memberships.map(m => (
                          <option key={m.user.id} value={m.user.id}>{m.user.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1">To (Receiver)</label>
                      <select 
                        value={settleReceiver}
                        onChange={e => setSettleReceiver(e.target.value)}
                        className="w-full bg-white border border-slate-355 rounded-lg px-3 py-2 text-slate-700"
                      >
                        {selectedGroup.memberships.map(m => (
                          <option key={m.user.id} value={m.user.id}>{m.user.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-1">Amount</label>
                        <input 
                          type="number" 
                          value={settleAmount}
                          onChange={e => setSettleAmount(e.target.value)}
                          placeholder="Amount..."
                          className="w-full bg-white border border-slate-355 rounded-lg px-3 py-2"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-1">Date</label>
                        <input 
                          type="date" 
                          value={settleDate}
                          onChange={e => setSettleDate(e.target.value)}
                          className="w-full bg-white border border-slate-355 rounded-lg px-3 py-2 text-slate-700"
                        />
                      </div>
                    </div>
                    
                    <button 
                      onClick={handleAddSettlement}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-lg cursor-pointer transition-colors shadow-sm"
                    >
                      Record Repayment
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB CONTENT: MEMBERS */}
            {groupTab === "members" && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider text-[10px] border-b border-slate-200">
                        <th className="py-3 px-4">Name</th>
                        <th className="py-3 px-4">Joined At</th>
                        <th className="py-3 px-4">Left At</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedGroup.memberships.map(m => (
                        <tr key={m.id} className="border-b border-slate-100 hover:bg-slate-50/50 text-xs text-slate-700">
                          <td className="py-3 px-4 font-semibold text-slate-900">{m.user.name}</td>
                          <td className="py-3 px-4">{new Date(m.joinedAt).toLocaleDateString()}</td>
                          <td className="py-3 px-4">{m.leftAt ? new Date(m.leftAt).toLocaleDateString() : "Active Member"}</td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-0.5 rounded-[4px] text-[10px] font-bold ${
                              m.leftAt ? "bg-red-55 border border-red-200 text-red-700" : "bg-green-55 border border-green-200 text-green-700"
                            }`}>
                              {m.leftAt ? "Inactive" : "Active"}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            {!m.leftAt && (
                              <button 
                                onClick={() => handleSoftDeleteMember(m.id)}
                                className="p-1 rounded hover:bg-red-50 hover:text-red-600 border border-transparent hover:border-red-200 text-slate-450 transition-all cursor-pointer"
                                title="Mark as Left (Soft Delete)"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Add Member Form */}
                <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm h-fit">
                  <h3 className="font-bold text-base text-slate-800 mb-4">Add Group Member</h3>
                  <div className="space-y-4 text-xs">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1">Email Address</label>
                      <input 
                        type="email" 
                        value={addMemberEmail}
                        onChange={e => setAddMemberEmail(e.target.value)}
                        placeholder="aisha@example.com"
                        className="w-full bg-white border border-slate-350 rounded-lg px-3 py-2"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1">Join Date</label>
                      <input 
                        type="date" 
                        value={addMemberJoinDate}
                        onChange={e => setAddMemberJoinDate(e.target.value)}
                        className="w-full bg-white border border-slate-355 rounded-lg px-3 py-2 text-slate-700"
                      />
                    </div>

                    <button 
                      onClick={handleAddMember}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-lg cursor-pointer transition-colors shadow-sm"
                    >
                      Add Member
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB CONTENT: BALANCES & DEBT PLAN */}
            {groupTab === "balances" && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  
                  {/* Balance ledger card */}
                  <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                    <h3 className="font-bold text-base text-slate-800 mb-4 flex items-center">
                      <ArrowLeftRight className="w-4 h-4 mr-2 text-slate-500" /> Group Balances
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
                              className="p-4 bg-white border border-slate-200 hover:border-blue-600 rounded-xl flex items-center justify-between transition-all cursor-pointer shadow-sm hover:shadow"
                            >
                              <div className="flex items-center space-x-3">
                                <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center font-bold text-blue-600 text-sm">
                                  {s.userName[0]}
                                </div>
                                <div>
                                  <h4 className="font-bold text-sm text-slate-800">{s.userName}</h4>
                                  <p className="text-[10px] text-slate-400">Click to audit balances</p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className={`font-bold text-sm ${
                                  isCreditor ? "text-green-600" :
                                  isDebtor ? "text-red-600" :
                                  "text-slate-450"
                                }`}>
                                  {isCreditor ? "+" : ""}{s.netBalance.toLocaleString("en-IN", { style: "currency", currency: "INR" })}
                                </p>
                                <span className="text-[9px] text-slate-450 font-bold uppercase tracking-wider">
                                  {isCreditor ? "Owed to them" : isDebtor ? "They owe" : "Settled"}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 py-4">No balance details computed.</p>
                    )}
                  </div>

                  {/* Debt minimization plans */}
                  <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm h-fit">
                    <h3 className="font-bold text-base text-slate-800 mb-4 flex items-center">
                      <CheckCircle className="w-4 h-4 mr-2 text-green-600" /> Simplified Debt Plan
                    </h3>

                    {balances && balances.simplifiedDebts.length > 0 ? (
                      <div className="space-y-3">
                        {balances.simplifiedDebts.map((d, idx) => (
                          <div key={idx} className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between text-xs">
                            <div className="flex items-center space-x-2 text-slate-650">
                              <span className="font-bold text-red-600">{d.fromUser}</span>
                              <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                              <span className="font-bold text-green-600">{d.toUser}</span>
                            </div>
                            <span className="font-extrabold text-blue-700 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded">
                              {d.amount.toLocaleString("en-IN", { style: "currency", currency: "INR" })}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 py-4 text-center">No outstanding debts!</p>
                    )}
                  </div>

                </div>
              </div>
            )}

          </div>
        )}

        {/* VIEW: CSV IMPORT QUEUE (REVIEW WORKFLOW REDESIGN) */}
        {view === "import" && selectedGroup && activeImportJobId && (
          <div className="space-y-6">
            
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <button 
                onClick={() => { setView("group-detail"); setImportStats(null); }}
                className="text-slate-500 hover:text-slate-850 flex items-center text-sm font-semibold transition-colors cursor-pointer"
              >
                <ArrowRight className="w-4 h-4 mr-1 rotate-180" /> Cancel and Back
              </button>
              <h2 className="text-lg font-bold text-slate-900 flex items-center">
                <AlertTriangle className="w-5 h-5 text-amber-500 mr-2" /> Anomaly Resolution Queue
              </h2>
            </div>

            {importStats ? (
              /* Statistics Import report */
              <div className="max-w-xl w-full mx-auto bg-white border border-slate-200 rounded-xl p-8 shadow-sm text-center space-y-6">
                <CheckCircle className="w-12 h-12 text-green-600 mx-auto" />
                <div>
                  <h3 className="text-xl font-bold text-slate-900">Import Completed Successfully</h3>
                  <p className="text-slate-500 text-xs mt-1">Audit resolve logs and new expenses logged in the group database.</p>
                </div>

                <div className="grid grid-cols-3 gap-3 p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-650">
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Rows Processed</p>
                    <p className="font-extrabold text-slate-800 text-base">{importStats.rowsProcessed}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Expenses Created</p>
                    <p className="font-extrabold text-green-600 text-base">+{importStats.expensesCreated}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Settlements</p>
                    <p className="font-extrabold text-blue-700 text-base">+{importStats.settlementsCreated}</p>
                  </div>
                </div>

                <button 
                  onClick={() => { setView("group-detail"); setImportStats(null); }}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2 rounded-lg cursor-pointer transition-all shadow-sm"
                >
                  View Group Balances
                </button>
              </div>
            ) : (
              /* Review anomalies list */
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Resolution queue */}
                <div className="lg:col-span-2 space-y-4">
                  
                  {activeImportAnomalies.length === 0 ? (
                    <div className="p-8 bg-white border border-slate-200 rounded-xl text-center space-y-2">
                      <CheckCircle className="w-10 h-10 text-green-600 mx-auto" />
                      <p className="font-semibold text-slate-800">CSV data is 100% clean!</p>
                      <p className="text-xs text-slate-500">No anomalies detected. Proceed to finalize import.</p>
                    </div>
                  ) : (
                    activeImportAnomalies.map(a => {
                      const resolution = importResolutions[a.fingerprint];
                      const isResolved = resolution && resolution.resolutionAction !== null;

                      return (
                        <div 
                          key={a.id}
                          className={`p-5 bg-white border rounded-xl shadow-sm transition-all ${
                            isResolved ? "border-green-500 bg-green-50/10" :
                            a.severity === "BLOCKING" ? "border-red-400" :
                            a.severity === "ERROR" ? "border-amber-400" :
                            "border-slate-200"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-3 text-xs">
                            <span className="font-bold text-slate-400">Row {a.rowNumber} • {a.anomalyType}</span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              a.severity === "BLOCKING" ? "bg-red-100 text-red-800" :
                              a.severity === "ERROR" ? "bg-amber-100 text-amber-800" :
                              a.severity === "WARNING" ? "bg-yellow-100 text-yellow-800" :
                              "bg-slate-100 text-slate-600"
                            }`}>
                              {a.severity}
                            </span>
                          </div>

                          <h4 className="font-bold text-sm text-slate-800 mb-3">{a.description}</h4>

                          {/* Raw Csv Preview */}
                          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-500 space-y-1 mb-3">
                            <p className="text-[10px] font-bold text-slate-400 uppercase">CSV raw row details</p>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                              <div>Date: <b>{a.rawRow.date}</b></div>
                              <div>Desc: <b>{a.rawRow.description}</b></div>
                              <div>Payer: <b>{a.rawRow.paid_by || "(empty)"}</b></div>
                              <div>Amt: <b>{a.rawRow.amount} {a.rawRow.currency}</b></div>
                            </div>
                          </div>

                          {/* Interactive Resolution Panel */}
                          <div className="flex flex-wrap gap-2 text-xs">
                            {/* Missing Payer */}
                            {a.anomalyType === "MISSING_PAYER" && (
                              <div className="space-y-2 w-full">
                                <p className="text-[10px] text-slate-500 font-bold uppercase">Assign Payer:</p>
                                <div className="flex flex-wrap gap-2">
                                  {selectedGroup.memberships.map(m => (
                                    <button
                                      key={m.id}
                                      onClick={() => handleResolveAnomaly(a.fingerprint, "MAPPED_USER", { from: "", to: m.user.name })}
                                      className={`px-3 py-1.5 rounded-lg border font-semibold cursor-pointer transition-all ${
                                        resolution?.resolutionDetails?.to === m.user.name
                                          ? "bg-blue-600 border-blue-500 text-white"
                                          : "bg-white border-slate-300 hover:bg-slate-50 text-slate-700"
                                      }`}
                                    >
                                      {m.user.name}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Unknown User Mapping */}
                            {a.anomalyType === "UNKNOWN_USER" && (
                              <div className="space-y-2 w-full">
                                <p className="text-[10px] text-slate-500 font-bold uppercase">Map to Existing member:</p>
                                <div className="flex flex-wrap gap-2">
                                  {selectedGroup.memberships.map(m => {
                                    const match = a.description.match(/'(.+?)'/);
                                    const rawName = match ? match[1] : "";
                                    return (
                                      <button
                                        key={m.id}
                                        onClick={() => handleResolveAnomaly(a.fingerprint, "MAPPED_USER", { from: rawName, to: m.user.name })}
                                        className={`px-3 py-1.5 rounded-lg border font-semibold cursor-pointer transition-all ${
                                          resolution?.resolutionDetails?.to === m.user.name
                                            ? "bg-blue-600 border-blue-500 text-white"
                                            : "bg-white border-slate-300 hover:bg-slate-50 text-slate-700"
                                        }`}
                                      >
                                        {m.user.name}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* Ambiguous Date Selector */}
                            {a.anomalyType === "AMBIGUOUS_DATE" && (
                              <div className="space-y-2 w-full">
                                <p className="text-[10px] text-slate-500 font-bold uppercase">Confirm Date interpretation:</p>
                                <div className="flex space-x-3">
                                  {(() => {
                                    const match = a.rawRow.date.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
                                    if (!match) return null;
                                    const d1 = `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
                                    const d2 = `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
                                    
                                    const label1 = new Date(d1).toLocaleDateString("en-IN", { day: "numeric", month: "long" });
                                    const label2 = new Date(d2).toLocaleDateString("en-IN", { day: "numeric", month: "long" });

                                    return (
                                      <>
                                        <button 
                                          onClick={() => handleResolveAnomaly(a.fingerprint, "ACCEPTED_WARNING", { selectedDate: d1 })}
                                          className={`px-3 py-1.5 rounded-lg border font-semibold cursor-pointer ${
                                            resolution?.resolutionDetails?.selectedDate === d1
                                              ? "bg-blue-600 border-blue-500 text-white"
                                              : "bg-white border-slate-300 hover:bg-slate-50 text-slate-700"
                                          }`}
                                        >
                                          {label1} (DD-MM)
                                        </button>
                                        <button 
                                          onClick={() => handleResolveAnomaly(a.fingerprint, "ACCEPTED_WARNING", { selectedDate: d2 })}
                                          className={`px-3 py-1.5 rounded-lg border font-semibold cursor-pointer ${
                                            resolution?.resolutionDetails?.selectedDate === d2
                                              ? "bg-blue-600 border-blue-500 text-white"
                                              : "bg-white border-slate-300 hover:bg-slate-50 text-slate-700"
                                          }`}
                                        >
                                          {label2} (MM-DD)
                                        </button>
                                      </>
                                    );
                                  })()}
                                </div>
                              </div>
                            )}

                            {/* Repayment Disguised */}
                            {a.anomalyType === "SETTLEMENT_DISGUISED_AS_EXPENSE" && (
                              <>
                                <button 
                                  onClick={() => handleResolveAnomaly(a.fingerprint, "CONVERTED_TO_SETTLEMENT")}
                                  className={`px-3 py-1.5 rounded-lg border font-semibold cursor-pointer ${
                                    resolution?.resolutionAction === "CONVERTED_TO_SETTLEMENT"
                                      ? "bg-blue-600 border-blue-550 text-white"
                                      : "bg-white border-slate-300 hover:bg-slate-50 text-slate-700"
                                  }`}
                                >
                                  Convert to Settlement
                                </button>
                                <button 
                                  onClick={() => handleResolveAnomaly(a.fingerprint, "ACCEPTED_WARNING")}
                                  className={`px-3 py-1.5 rounded-lg border font-semibold cursor-pointer ${
                                    resolution?.resolutionAction === "ACCEPTED_WARNING"
                                      ? "bg-slate-200 border-slate-300 text-slate-800"
                                      : "bg-white border-slate-300 hover:bg-slate-50 text-slate-700"
                                  }`}
                                >
                                  Keep as regular Expense
                                </button>
                              </>
                            )}

                            {/* Duplicate checking */}
                            {a.anomalyType === "DUPLICATE" && (
                              <>
                                <button 
                                  onClick={() => handleResolveAnomaly(a.fingerprint, "REJECT_ROW")}
                                  className={`px-3 py-1.5 rounded-lg border font-semibold cursor-pointer ${
                                    resolution?.resolutionAction === "REJECT_ROW"
                                      ? "bg-red-600 border-red-500 text-white"
                                      : "bg-white border-slate-300 hover:bg-slate-50 text-red-650"
                                  }`}
                                >
                                  Discard Duplicate Row
                                </button>
                                <button 
                                  onClick={() => handleResolveAnomaly(a.fingerprint, "APPROVED_DUPLICATE")}
                                  className={`px-3 py-1.5 rounded-lg border font-semibold cursor-pointer ${
                                    resolution?.resolutionAction === "APPROVED_DUPLICATE"
                                      ? "bg-green-600 border-green-500 text-white"
                                      : "bg-white border-slate-300 hover:bg-slate-50 text-slate-700"
                                  }`}
                                >
                                  Approve Duplicate
                                </button>
                              </>
                            )}

                            {/* Safe Warns */}
                            {["MISSING_CURRENCY", "NEGATIVE_AMOUNT", "ZERO_AMOUNT", "MEMBERSHIP_VIOLATION"].includes(a.anomalyType) && (
                              <>
                                <button 
                                  onClick={() => handleResolveAnomaly(a.fingerprint, "ACCEPTED_WARNING")}
                                  className={`px-3 py-1.5 rounded-lg border font-semibold cursor-pointer ${
                                    resolution?.resolutionAction === "ACCEPTED_WARNING"
                                      ? "bg-blue-600 border-blue-500 text-white"
                                      : "bg-white border-slate-300 hover:bg-slate-50 text-slate-700"
                                  }`}
                                >
                                  Acknowledge & Accept
                                </button>
                                {a.anomalyType === "MEMBERSHIP_VIOLATION" && (
                                  <button 
                                    onClick={() => handleResolveAnomaly(a.fingerprint, "REJECT_ROW")}
                                    className={`px-3 py-1.5 rounded-lg border font-semibold cursor-pointer ${
                                      resolution?.resolutionAction === "REJECT_ROW"
                                        ? "bg-red-600 border-red-500 text-white"
                                        : "bg-white border-slate-300 hover:bg-slate-50 text-red-650"
                                    }`}
                                  >
                                    Exclude Row
                                  </button>
                                )}
                              </>
                            )}

                          </div>

                          {/* Notes */}
                          <div className="mt-3.5">
                            <input 
                              type="text" 
                              value={resolution?.resolutionNote || ""}
                              onChange={e => handleResolveNote(a.fingerprint, e.target.value)}
                              placeholder="Add resolution explanation audit trail note..."
                              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs focus:outline-none"
                            />
                          </div>

                        </div>
                      );
                    })
                  )}
                </div>

                {/* Right Column: Diagnostics panel and Final controls */}
                <div className="space-y-6">
                  {/* Final control */}
                  <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
                    <h3 className="font-bold text-base text-slate-800">Import Controller</h3>
                    <div className="text-xs text-slate-500 space-y-2">
                      <div className="flex justify-between">
                        <span>Total anomalies:</span>
                        <span className="font-bold text-slate-800">{activeImportAnomalies.length}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Resolved items:</span>
                        <span className="font-bold text-green-600">
                          {Object.values(importResolutions).filter(r => r.resolutionAction !== null).length} / {activeImportAnomalies.length}
                        </span>
                      </div>
                    </div>
                    <button 
                      onClick={handleFinalizeImport}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-lg cursor-pointer text-xs"
                    >
                      Persist Resolved Data & Generate Report
                    </button>
                  </div>

                  {/* Diagnostics Panel */}
                  <div className="bg-slate-950 text-slate-200 rounded-xl p-5 shadow-sm space-y-3 font-mono text-[10px]">
                    <h4 className="font-bold border-b border-slate-800 pb-2 text-slate-400 flex items-center">
                      <Database className="w-3.5 h-3.5 mr-1" /> Import Diagnostics
                    </h4>
                    <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                      {diagnosticsLogs.length === 0 ? (
                        <p className="text-slate-500">Awaiting import pipeline start...</p>
                      ) : (
                        diagnosticsLogs.map((log, idx) => (
                          <div key={idx} className="space-y-1">
                            <p className="text-blue-400">[{log.timestamp}] STAGE: {log.stage}</p>
                            <pre className="text-slate-400 overflow-x-auto bg-slate-900/50 p-2 rounded max-w-[250px]">
                              {JSON.stringify(log.details, null, 2)}
                            </pre>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

              </div>
            )}
          </div>
        )}

        {/* VIEW: ADMIN INTERVIEW/DEMO VIEW */}
        {view === "admin-demo" && adminDemoData && (
          <div className="space-y-6 animate-fade-in">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <button 
                onClick={() => setView("dashboard")}
                className="text-slate-500 hover:text-slate-800 flex items-center text-sm font-semibold transition-colors cursor-pointer"
              >
                <ArrowRight className="w-4 h-4 mr-1 rotate-180" /> Back to Dashboard
              </button>
              <h2 className="text-xl font-bold text-slate-900 flex items-center">
                <ShieldAlert className="w-5 h-5 mr-2 text-blue-600" /> Admin Walkthrough Diagnostics
              </h2>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Left Side: Audit Log Feed */}
              <div className="lg:col-span-2 space-y-6">
                
                {/* Audit Logs */}
                <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                  <h3 className="font-bold text-base text-slate-800 mb-4 flex items-center">
                    <History className="w-4 h-4 mr-2 text-slate-500" /> Audit Resolution Logs
                  </h3>

                  <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                    {adminDemoData.auditLogs.length === 0 ? (
                      <p className="text-xs text-slate-400">No audit logs written.</p>
                    ) : (
                      adminDemoData.auditLogs.map(log => (
                        <div key={log.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-2">
                          <div className="flex justify-between text-[10px] text-slate-450">
                            <span>ACTION: <b>{log.action}</b></span>
                            <span>{new Date(log.createdAt).toLocaleString()}</span>
                          </div>
                          <p className="font-medium text-slate-800">
                            Entity: {log.entityType} ({log.entityId})
                          </p>
                          {log.afterState && (
                            <pre className="p-2 bg-slate-900 text-slate-200 rounded overflow-x-auto text-[9px]">
                              {JSON.stringify(log.afterState, null, 2)}
                            </pre>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Import Job Diagnostics details */}
                <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                  <h3 className="font-bold text-base text-slate-800 mb-4 flex items-center">
                    <FileText className="w-4 h-4 mr-2 text-slate-500" /> Import Anomaly Files Details
                  </h3>
                  <div className="space-y-4">
                    {adminDemoData.importJobs.map(job => (
                      <div key={job.id} className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 text-xs">
                        <div className="flex items-center justify-between">
                          <h4 className="font-bold text-slate-800">{job.rawFileName}</h4>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">{job.status}</span>
                        </div>
                        <p className="text-[10px] text-slate-400">File Hash: {job.rawFileHash}</p>
                        {job.anomalies && job.anomalies.length > 0 && (
                          <div className="space-y-2 pl-3 border-l-2 border-slate-200">
                            <p className="font-semibold text-slate-500 text-[10px] uppercase">Anomalies Resolved:</p>
                            {job.anomalies.map(a => (
                              <div key={a.id} className="text-[11px] text-slate-700">
                                Row {a.rowNumber} ({a.anomalyType}): {a.description} 
                                {a.resolutionAction && <b className="text-green-600"> $\rightarrow$ Resolved ({a.resolutionAction})</b>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

              </div>

              {/* Right Side: Membership soft delete logs */}
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm h-fit">
                <h3 className="font-bold text-base text-slate-800 mb-4 flex items-center">
                  <Calendar className="w-4 h-4 mr-2 text-slate-500" /> Membership Active Periods
                </h3>
                <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                  {adminDemoData.memberships.map(m => (
                    <div key={m.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
                      <div className="flex justify-between font-bold text-slate-800">
                        <span>{m.user.name}</span>
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                          m.leftAt ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"
                        }`}>
                          {m.leftAt ? "Inactive" : "Active"}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500">Group: {m.group.name}</p>
                      <p className="text-[10px] text-slate-400">Joined: {new Date(m.joinedAt).toLocaleDateString()}</p>
                      {m.leftAt && <p className="text-[10px] text-rose-600">Left: {new Date(m.leftAt).toLocaleDateString()}</p>}
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        )}

      </main>

      {/* Modal: Traceability audit timeline */}
      {traceUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-xl w-full p-6 shadow-2xl flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-4">
              <div>
                <h3 className="font-bold text-base text-slate-900">Ledger Audit: {traceUser.userName}</h3>
                <p className="text-[10px] text-slate-500">Chronological list of transaction calculations</p>
              </div>
              <button 
                onClick={() => setTraceUser(null)}
                className="text-xs font-semibold px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg cursor-pointer transition-colors"
              >
                Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {traceUser.trace.map((t, idx) => {
                const isExpense = t.type === "EXPENSE";
                const net = t.netEffect;
                return (
                  <div key={idx} className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs flex justify-between items-center">
                    <div>
                      <div className="flex items-center space-x-1.5">
                        <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${
                          isExpense ? "bg-blue-100 text-blue-800" : "bg-emerald-100 text-emerald-800"
                        }`}>
                          {t.type}
                        </span>
                        <span className="font-bold text-slate-800">
                          {isExpense ? t.title : `${t.payerName} to ${t.receiverName}`}
                        </span>
                      </div>
                      <p className="text-[9px] text-slate-400 mt-1">
                        {new Date(t.date).toLocaleDateString()} • Original amount: {t.originalAmount || t.amount} {t.currency}
                      </p>
                    </div>

                    <div className="flex items-center space-x-4">
                      <div className="text-right text-[10px] text-slate-450 space-y-0.5">
                        {isExpense ? (
                          <>
                            <div>Paid: {t.paidAmount.toLocaleString("en-IN")}</div>
                            <div>Owed: {t.owedAmount?.toLocaleString("en-IN")}</div>
                          </>
                        ) : (
                          <>
                            {t.paidAmount > 0 && <div>Paid: {t.paidAmount.toLocaleString("en-IN")}</div>}
                            {t.receivedAmount !== undefined && t.receivedAmount > 0 && <div>Received: {t.receivedAmount.toLocaleString("en-IN")}</div>}
                          </>
                        )}
                      </div>

                      <span className={`font-bold min-w-[70px] text-right ${
                        net > 0 ? "text-green-600" : net < 0 ? "text-red-650" : "text-slate-550"
                      }`}>
                        {net > 0 ? "+" : ""}{net.toLocaleString("en-IN")}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="border-t border-slate-200 pt-4 mt-4 flex justify-between items-center">
              <span className="text-xs font-bold text-slate-500">Net Ledger Balance:</span>
              <span className={`font-extrabold text-base ${
                traceUser.netBalance > 0 ? "text-green-650" : traceUser.netBalance < 0 ? "text-red-650" : "text-slate-700"
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
