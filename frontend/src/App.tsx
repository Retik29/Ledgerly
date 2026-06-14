import React, { useState, useEffect, useMemo } from "react";
import { api } from "./services/api";
import { 
  Users, Plus, Upload, Trash2, ArrowRight, UserCheck, AlertTriangle, AlertOctagon, 
  CheckCircle, ArrowLeftRight, ArrowRightLeft, Receipt, HelpCircle, LogOut, Check, RefreshCw, Info, Calendar, FileText,
  Search, Eye, ShieldAlert, History, Activity, Database, CheckSquare, Layers,
  UploadCloud, CreditCard, Clock, ArrowUpRight, ArrowDownRight, Sparkles, FileSpreadsheet
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
  groupId: string | null;
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
  anomaliesCount?: number;
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

const GroupSkeleton = () => (
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-pulse">
    {[1, 2].map(i => (
      <div key={i} className="p-5 bg-white border border-slate-200 rounded-xl space-y-4 shadow-sm">
        <div className="space-y-2">
          <div className="h-4 bg-slate-200 rounded w-2/3"></div>
          <div className="h-3 bg-slate-100 rounded w-1/3"></div>
        </div>
        <div className="border-t border-slate-100 pt-3 flex justify-between items-center">
          <div className="flex space-x-1">
            <div className="w-5 h-5 bg-slate-200 rounded-full"></div>
            <div className="w-5 h-5 bg-slate-200 rounded-full"></div>
          </div>
          <div className="h-4 bg-slate-100 rounded w-1/4"></div>
        </div>
      </div>
    ))}
  </div>
);

const SnapshotSkeleton = () => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-pulse">
    {[1, 2].map(i => (
      <div key={i} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
        <div className="h-4 bg-slate-200 rounded w-2/3 animate-pulse"></div>
        <div className="space-y-2">
          <div className="h-10 bg-slate-50 border border-slate-100 rounded-lg"></div>
          <div className="h-10 bg-slate-50 border border-slate-100 rounded-lg"></div>
        </div>
      </div>
    ))}
  </div>
);

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

  // Feedback Layer & Loading Skeletons State
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [loadingBalances, setLoadingBalances] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [toasts, setToasts] = useState<{ id: string; message: string; type: "success" | "error" | "warning" }[]>([]);

  // Stepper & Anomaly Severity Tab Filtering
  const [importStep, setImportStep] = useState<1 | 2 | 3 | 4 | 5 | 6>(1);
  const [anomalyTab, setAnomalyTab] = useState<"ALL" | "BLOCKING" | "ERROR" | "WARNING" | "INFO">("ALL");

  // Global Cross-Group balances snapshot state
  const [globalBalances, setGlobalBalances] = useState<{ creditors: any[]; debtors: any[] } | null>(null);
  const [importStartTime, setImportStartTime] = useState<number | null>(null);
  const [showOptimized, setShowOptimized] = useState(true);
  const [selectedImportJob, setSelectedImportJob] = useState<any | null>(null);

  const showToast = (message: string, type: "success" | "error" | "warning" = "success") => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  // Import State
  const [importJobs, setImportJobs] = useState<ImportJob[]>([]);
  const [activeImportJobId, setActiveImportJobId] = useState<string | null>(null);
  const [activeImportAnomalies, setActiveImportAnomalies] = useState<ImportAnomaly[]>([]);
  const [importResolutions, setImportResolutions] = useState<{ [fingerprint: string]: any }>({});
  const [importCsvContent, setImportCsvContent] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importStats, setImportStats] = useState<any | null>(null);
  const [importError, setImportError] = useState("");
  const [duplicateBatchError, setDuplicateBatchError] = useState<{ jobId: string; message: string } | null>(null);

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

  const fetchGlobalBalances = async () => {
    setLoadingBalances(true);
    try {
      const res = await api.get("/balances/global");
      setGlobalBalances(res.data);
    } catch (err) {
      console.error("Fetch global balances error:", err);
    } finally {
      setLoadingBalances(false);
    }
  };

  const fetchGroups = async () => {
    setLoadingGroups(true);
    try {
      const res = await api.get("/groups");
      setGroups(res.data);
      if (token) {
        fetchGlobalBalances();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingGroups(false);
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

  const handleQuickAddExpense = async (groupId: string) => {
    setSelectedGroupId(groupId);
    await fetchGroupDetails(groupId);
    setGroupTab("expenses");
    setView("group-detail");
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    try {
      const res = await api.post("/groups", { name: newGroupName });
      const createdGroup = res.data;
      setNewGroupName("");
      showToast("Group created successfully", "success");
      await fetchGroups();

      if (createdGroup && createdGroup.id) {
        setSelectedGroupId(createdGroup.id);
        await fetchGroupDetails(createdGroup.id);
        setGroupTab("overview");
        setView("group-detail");
      }
    } catch (err) {
      console.error(err);
      showToast("Failed to create group", "error");
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

  const handleBulkIgnoreInfo = () => {
    setImportResolutions(prev => {
      const updated = { ...prev };
      activeImportAnomalies.forEach(a => {
        if (a.severity === "INFO") {
          updated[a.fingerprint] = {
            ...updated[a.fingerprint],
            resolutionAction: "ACCEPTED_WARNING",
            resolutionNote: "Bulk auto-ignored info severity alert"
          };
        }
      });
      return updated;
    });
    showToast("Ignored all info alerts", "success");
  };

  const handleBulkAutoResolveSafe = () => {
    setImportResolutions(prev => {
      const updated = { ...prev };
      activeImportAnomalies.forEach(a => {
        if (["MISSING_CURRENCY", "NEGATIVE_AMOUNT", "ZERO_AMOUNT", "MEMBERSHIP_VIOLATION"].includes(a.anomalyType) || a.severity === "WARNING") {
          updated[a.fingerprint] = {
            ...updated[a.fingerprint],
            resolutionAction: "ACCEPTED_WARNING",
            resolutionNote: "Bulk auto-resolved safe warning"
          };
        }
      });
      return updated;
    });
    showToast("Auto-resolved safe warnings", "success");
  };

  const handleUploadCsv = async (mode: string = "PRODUCTION") => {
    if (!importFile || !importCsvContent || !selectedGroupId) return;
    setImportError("");
    setDuplicateBatchError(null);
    setImportStats(null);
    setDiagnosticsLogs([]); 
    setImportStartTime(Date.now());
    setView("import");
    
    // Step 2: Parsing
    setImportStep(2);
    addDiagnosticsLog("REQUEST_VALIDATION", { filename: importFile.name, size: importFile.size, mode });

    try {
      // Small simulated delay for premium UX
      await new Promise(resolve => setTimeout(resolve, 600));
      
      // Step 3: Anomaly Detection
      setImportStep(3);
      addDiagnosticsLog("DUPLICATE_CHECK", { checkingDb: true });
      addDiagnosticsLog("CSV_PARSER", { parsing: true });

      const res = await api.post("/imports/upload", {
        filename: importFile.name,
        csvContent: importCsvContent,
        groupId: selectedGroupId,
        mode
      });

      addDiagnosticsLog("ANOMALY_ENGINE", {
        anomaliesCount: res.data.anomaliesCount,
        anomalies: res.data.anomalies
      });

      // Small delay before review
      await new Promise(resolve => setTimeout(resolve, 600));

      setActiveImportJobId(res.data.jobId);
      setActiveImportAnomalies(res.data.anomalies);
      
      const initialResolutions: any = {};
      res.data.anomalies.forEach((a: ImportAnomaly) => {
        initialResolutions[a.fingerprint] = {
          anomalyType: a.fingerprint,
          fingerprint: a.fingerprint,
          resolutionAction: a.severity === "INFO" ? "ACCEPTED_WARNING" : null,
          resolutionNote: "",
          resolutionDetails: {}
        };
      });
      setImportResolutions(initialResolutions);
      
      // Step 4: Review Queue
      setImportStep(4);
    } catch (err: any) {
      const errData = err.response?.data;
      if (errData && errData.error === "DUPLICATE_BATCH") {
        setDuplicateBatchError({ jobId: errData.jobId, message: errData.message });
        setImportStep(2); // Keep stepper at Parsing stage but show duplicate card
        return;
      }
      addDiagnosticsLog(errData?.stage || "SERVER_CRASH", { error: errData?.message || err.message });
      setImportError(errData?.message || "Failed to analyze CSV file.");
      setImportStep(1);
      setView("group-detail");
      showToast(errData?.message || "Failed to analyze CSV file", "error");
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
    
    const unresolved = activeImportAnomalies.some(a => {
      const res = importResolutions[a.fingerprint];
      return !res || res.resolutionAction === null;
    });

    if (unresolved) {
      showToast("Please resolve all anomalies in the review queue before proceeding.", "warning");
      return;
    }

    // Check if any split anomaly has an invalid sum
    const invalidSplit = activeImportAnomalies.some(a => {
      const res = importResolutions[a.fingerprint];
      if (res && res.resolutionAction === "CORRECTED_PERCENT_SPLIT") {
        const details = (res.resolutionDetails?.correctedSplitDetails || {}) as Record<string, number>;
        if (Object.keys(details).length === 0) return true;
        const sum = Object.values(details).reduce((x: number, y: number) => x + y, 0);
        if (a.anomalyType === "INVALID_PERCENT_SPLIT") {
          return Math.abs(sum - 100) > 0.01;
        } else if (a.anomalyType === "INVALID_EXACT_SPLIT") {
          const total = a.normalizedRow.originalAmount || 0;
          return Math.abs(sum - total) > 0.01;
        }
      }
      return false;
    });

    if (invalidSplit) {
      showToast("One or more split adjustments are invalid. The sum must match exactly 100% (or the total amount).", "warning");
      return;
    }

    // Step 5: Finalizing
    setImportStep(5);
    try {
      addDiagnosticsLog("PERSISTENCE", { finalizing: true });
      
      // Simulated processing delay for premium UX
      await new Promise(resolve => setTimeout(resolve, 800));

      const res = await api.post(`/imports/jobs/${activeImportJobId}/resolve`, {
        groupId: selectedGroupId,
        csvContent: importCsvContent,
        resolutions: Object.values(importResolutions)
      });
      setImportStats(res.data.summary);
      addDiagnosticsLog("COMPLETED", res.data.summary);
      
      // Step 6: Completed
      setImportStep(6);
      showToast("Import completed successfully!", "success");
      fetchImportJobs();
      fetchGroupDetails(selectedGroupId);
    } catch (err: any) {
      const errData = err.response?.data;
      addDiagnosticsLog(errData?.stage || "PERSISTENCE_FAILED", { error: errData?.message || err.message });
      showToast(errData?.message || "Import persistence failed", "error");
      setImportStep(4); // Back to review queue
    }
  };

  // Memoized dynamic audit log timeline for financial audit ledger representation
  const dynamicTimeline = useMemo(() => {
    const events: { id: string; date: string; title: string; category: string; user: string; amount?: number }[] = [];
    
    groups.forEach(g => {
      const groupExpenses = (g as any).expenses || [];
      groupExpenses.forEach((e: any) => {
        events.push({
          id: `exp-${e.id}`,
          date: e.expenseDate || e.createdAt,
          title: `Expense created: "${e.title}"`,
          category: "Expense",
          user: e.payer?.name || "Member",
          amount: e.normalizedAmount
        });
      });
      
      const groupSettlements = (g as any).settlements || [];
      groupSettlements.forEach((s: any) => {
        events.push({
          id: `settle-${s.id}`,
          date: s.settlementDate || s.createdAt,
          title: `Settlement recorded: ${s.payer?.name} repaid ${s.receiver?.name}`,
          category: "Settlement",
          user: s.payer?.name || "Member",
          amount: s.amount
        });
      });
    });

    importJobs.forEach(j => {
      events.push({
        id: `job-${j.id}`,
        date: j.uploadedAt,
        title: `CSV ledger reconciliation sheet "${j.rawFileName}" uploaded`,
        category: "Import",
        user: "System",
        amount: j.summary?.rowsProcessed || 0
      });
    });

    if (selectedGroupId && selectedGroup) {
      expenses.forEach(e => {
        if (!events.some(evt => evt.id === `exp-${e.id}`)) {
          events.push({
            id: `exp-${e.id}`,
            date: e.expenseDate,
            title: `Expense created: "${e.title}"`,
            category: "Expense",
            user: e.payer?.name || "Member",
            amount: e.normalizedAmount
          });
        }
      });
      settlements.forEach(s => {
        if (!events.some(evt => evt.id === `settle-${s.id}`)) {
          events.push({
            id: `settle-${s.id}`,
            date: s.settlementDate,
            title: `Settlement recorded: ${s.payer?.name} repaid ${s.receiver?.name}`,
            category: "Settlement",
            user: s.payer?.name || "Member",
            amount: s.amount
          });
        }
      });
    }

    events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return events.slice(0, 10);
  }, [groups, importJobs, selectedGroupId, selectedGroup, expenses, settlements]);

  // Memoized unminimized (raw) debts calculated directly from expenses and settlements
  const rawDebts = useMemo(() => {
    if (!selectedGroup) return [];
    
    const memberMap = new Map<string, string>();
    selectedGroup.memberships.forEach(m => {
      memberMap.set(m.user.id, m.user.name);
    });
    
    const debtMatrix: { [from: string]: { [to: string]: number } } = {};
    
    const addDebt = (from: string, to: string, amt: number) => {
      if (from === to || amt <= 0.01) return;
      if (!debtMatrix[from]) debtMatrix[from] = {};
      debtMatrix[from][to] = (debtMatrix[from][to] || 0) + amt;
    };
    
    // 1. Process expenses
    expenses.forEach(exp => {
      const payerId = exp.payer?.id;
      const payerName = exp.payer?.name;
      if (!payerName || !payerId) return;
      
      exp.participants.forEach(part => {
        const debtorId = part.user?.id;
        const debtorName = part.user?.name;
        if (!debtorName || !debtorId || debtorId === payerId) return;
        
        const share = typeof part.shareAmount === 'number' ? part.shareAmount : parseFloat(part.shareAmount as any) || 0;
        addDebt(debtorName, payerName, share);
      });
    });
    
    // 2. Process settlements
    settlements.forEach(settle => {
      const payerName = settle.payer?.name;
      const receiverName = settle.receiver?.name;
      if (!payerName || !receiverName) return;
      
      const amt = typeof settle.amount === 'number' ? settle.amount : parseFloat(settle.amount as any) || 0;
      addDebt(payerName, receiverName, -amt); 
    });
    
    // 3. Flatten and net out between pairs
    const flattened: { fromUser: string; toUser: string; amount: number }[] = [];
    const keys = Object.keys(debtMatrix);
    const visitedPairs = new Set<string>();
    
    keys.forEach(from => {
      Object.keys(debtMatrix[from]).forEach(to => {
        const pairKey = [from, to].sort().join("::");
        if (visitedPairs.has(pairKey)) return;
        visitedPairs.add(pairKey);
        
        const debt1 = debtMatrix[from][to] || 0;
        const debt2 = debtMatrix[to]?.[from] || 0;
        const net = debt1 - debt2;
        
        if (net > 0.01) {
          flattened.push({ fromUser: from, toUser: to, amount: parseFloat(net.toFixed(2)) });
        } else if (net < -0.01) {
          flattened.push({ fromUser: to, toUser: from, amount: parseFloat(Math.abs(net).toFixed(2)) });
        }
      });
    });
    
    return flattened;
  }, [selectedGroup, expenses, settlements]);

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
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] flex flex-col font-sans antialiased selection:bg-blue-600 selection:text-white">
      {/* Toast Notifications */}
      {toasts.length > 0 && (
        <div className="fixed top-4 right-4 z-50 space-y-2 pointer-events-none">
          {toasts.map(t => (
            <div 
              key={t.id} 
              className={`flex items-center space-x-2 px-4 py-3 rounded-xl border text-xs font-semibold shadow-lg transition-all transform translate-y-0 opacity-100 max-w-sm pointer-events-auto ${
                t.type === "success" ? "bg-green-50 border-green-200 text-green-800" :
                t.type === "error" ? "bg-red-50 border-red-200 text-red-800" :
                "bg-amber-50 border-amber-200 text-amber-805"
              }`}
            >
              {t.type === "success" && <CheckCircle className="w-4 h-4 text-green-600 shrink-0" strokeWidth={1.5} />}
              {t.type === "error" && <AlertOctagon className="w-4 h-4 text-red-600 shrink-0" strokeWidth={1.5} />}
              {t.type === "warning" && <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" strokeWidth={1.5} />}
              <span>{t.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Header */}
      <header className="border-b border-slate-200 bg-white sticky top-0 z-40 px-6 py-3.5 flex items-center justify-between shadow-sm">
        <div className="flex items-center space-x-2.5 cursor-pointer" onClick={() => {
          setView(token ? "dashboard" : "login");
          window.location.hash = "";
          setSelectedGroupId(null);
          setSelectedGroup(null);
          setActiveImportJobId(null);
          setSelectedImportJob(null);
          setActiveImportAnomalies([]);
          setImportResolutions({});
          setImportStats(null);
        }}>
          <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
            <CreditCard className="w-4 h-4" strokeWidth={1.5} />
          </div>
          <div>
            <h1 className="font-bold text-base tracking-tight text-slate-950">Ledgerly</h1>
          </div>
        </div>
        
        <div className="flex items-center space-x-4">
          {currentUser && groups.length > 0 && (
            <div className="hidden md:flex items-center space-x-2">
              <span className="text-xs font-medium text-slate-500">Active group:</span>
              <select 
                value={selectedGroupId || ""}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "") {
                    setView("dashboard");
                    setSelectedGroupId(null);
                    setSelectedGroup(null);
                  } else {
                    setSelectedGroupId(val);
                    fetchGroupDetails(val);
                    setGroupTab("overview");
                    setView("group-detail");
                  }
                }}
                className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-600 transition-colors cursor-pointer"
              >
                <option value="">Dashboard overview</option>
                {groups.map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
          )}

          {currentUser && (
            <>
              <button 
                onClick={() => { setView("admin-demo"); window.location.hash = "#/admin/demo"; }}
                className={`text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer flex items-center ${
                  view === "admin-demo"
                    ? "bg-blue-50 border-blue-200 text-blue-700 font-semibold"
                    : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                <Layers className="w-3.5 h-3.5 mr-1" strokeWidth={1.5} /> Demo mode
              </button>
              <div className="flex items-center space-x-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700">
                <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-[10px]">
                  {currentUser.name[0].toUpperCase()}
                </div>
                <span className="text-slate-900">{currentUser.name}</span>
              </div>
              <button 
                onClick={handleLogout}
                className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 hover:text-red-600 text-slate-500 transition-all cursor-pointer"
                title="Logout"
              >
                <LogOut className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </>
          )}
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto p-6 md:p-8">
        
        {/* VIEW: LOGIN */}
        {view === "login" && (
          <div className="max-w-md w-full mx-auto my-16 bg-white border border-slate-200 rounded-xl p-8 shadow-sm">
            <h2 className="text-xl font-semibold text-slate-950 text-center mb-1.5">Welcome back</h2>
            <p className="text-slate-500 text-xs text-center mb-6 font-medium">Access your shared expenses and imports</p>

            {authError && <div className="p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-xs font-medium mb-4">{authError}</div>}

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Email address</label>
                <input 
                  type="email" 
                  value={authEmail} 
                  onChange={e => setAuthEmail(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3.5 py-2 text-xs font-medium focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600" 
                  placeholder="name@example.com"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Password</label>
                <input 
                  type="password" 
                  value={authPassword} 
                  onChange={e => setAuthPassword(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3.5 py-2 text-xs font-medium focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                  placeholder="••••••••"
                />
              </div>
              <button 
                onClick={() => handleAuth("login")}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold py-2.5 rounded-lg transition-all shadow-sm mt-6 cursor-pointer"
              >
                Log in
              </button>
            </div>
            
            <p className="text-xs text-slate-500 text-center mt-6">
              New here? <button onClick={() => { setView("register"); setAuthError(""); }} className="text-blue-600 hover:underline font-semibold cursor-pointer">Create an account</button>
            </p>
          </div>
        )}

        {/* VIEW: REGISTER */}
        {view === "register" && (
          <div className="max-w-md w-full mx-auto my-16 bg-white border border-slate-200 rounded-xl p-8 shadow-sm">
            <h2 className="text-xl font-semibold text-slate-950 text-center mb-1.5">Create account</h2>
            <p className="text-slate-500 text-xs text-center mb-6 font-medium">Register to manage shared group accounts</p>

            {authError && <div className="p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-xs font-medium mb-4">{authError}</div>}

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Full name</label>
                <input 
                  type="text" 
                  value={authName} 
                  onChange={e => setAuthName(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3.5 py-2 text-xs font-medium focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600" 
                  placeholder="Aisha"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Email address</label>
                <input 
                  type="email" 
                  value={authEmail} 
                  onChange={e => setAuthEmail(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3.5 py-2 text-xs font-medium focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600" 
                  placeholder="aisha@example.com"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Password</label>
                <input 
                  type="password" 
                  value={authPassword} 
                  onChange={e => setAuthPassword(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3.5 py-2 text-xs font-medium focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                  placeholder="••••••••"
                />
              </div>
              <button 
                onClick={() => handleAuth("register")}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold py-2.5 rounded-lg transition-all shadow-sm mt-6 cursor-pointer"
              >
                Register
              </button>
            </div>
            
            <p className="text-xs text-slate-500 text-center mt-6">
              Already have an account? <button onClick={() => { setView("login"); setAuthError(""); }} className="text-blue-600 hover:underline font-semibold cursor-pointer">Log in</button>
            </p>
          </div>
        )}
        {/* VIEW: DASHBOARD */}
        {view === "dashboard" && (
          <div className="space-y-8 animate-fade-in">
            {/* KPI Cards Header */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm flex items-center space-x-3.5">
                <div className="p-2.5 bg-blue-50 text-blue-600 border border-blue-100 rounded-lg"><Users className="w-5 h-5" strokeWidth={1.5} /></div>
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Active groups</p>
                  <p className="font-bold text-lg text-slate-900">{groups.length}</p>
                </div>
              </div>
              <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm flex items-center space-x-3.5">
                <div className="p-2.5 bg-green-50 text-green-600 border border-green-100 rounded-lg"><Receipt className="w-5 h-5" strokeWidth={1.5} /></div>
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Reconciled expenses</p>
                  <p className="font-bold text-lg text-slate-900">
                    {groups.reduce((acc, g) => acc + ((g as any).expenses?.length || 0), 0)}
                  </p>
                </div>
              </div>
              <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm flex items-center space-x-3.5">
                <div className="p-2.5 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-lg"><ArrowRightLeft className="w-5 h-5" strokeWidth={1.5} /></div>
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Logged settlements</p>
                  <p className="font-bold text-lg text-slate-900">
                    {groups.reduce((acc, g) => acc + ((g as any).settlements?.length || 0), 0)}
                  </p>
                </div>
              </div>
              <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm flex items-center space-x-3.5">
                <div className="p-2.5 bg-amber-50 text-amber-600 border border-amber-100 rounded-lg"><FileSpreadsheet className="w-5 h-5" strokeWidth={1.5} /></div>
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Spreadsheet uploads</p>
                  <p className="font-bold text-lg text-slate-900">{importJobs.length}</p>
                </div>
              </div>
            </div>

            {/* Balance Snapshot Section */}
            <div className="space-y-3">
              <h3 className="font-semibold text-sm text-slate-800 flex items-center">
                <ArrowRightLeft className="w-4 h-4 mr-2 text-slate-400" strokeWidth={1.5} /> Balance snapshot
              </h3>
              {loadingBalances ? (
                <SnapshotSkeleton />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Creditors Card (Accounts Receivable) */}
                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2.5">
                        <div className="p-2 bg-green-50 text-green-600 border border-green-100 rounded-lg">
                          <ArrowUpRight className="w-4 h-4" strokeWidth={1.5} />
                        </div>
                        <div>
                          <h4 className="font-semibold text-sm text-slate-800">Accounts receivable</h4>
                          <p className="text-[10px] text-slate-400 font-medium">Outstanding funds to collect</p>
                        </div>
                      </div>
                      <span className="font-bold text-base text-green-600">
                        {globalBalances?.creditors?.reduce((sum: number, c: any) => sum + c.amount, 0).toLocaleString("en-IN", { style: "currency", currency: "INR" }) || "₹0.00"}
                      </span>
                    </div>

                    <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1 custom-scrollbar">
                      {!globalBalances || globalBalances.creditors?.length === 0 ? (
                        <p className="text-xs text-slate-400 py-4 text-center font-medium">No outstanding receivables.</p>
                      ) : (
                        globalBalances.creditors?.map((c: any, idx: number) => (
                          <div key={idx} className="flex items-center justify-between p-2.5 bg-green-50/20 border border-green-100/50 rounded-lg text-xs">
                            <span className="font-medium text-slate-700">{c.userName} <span className="text-[10px] text-slate-400 font-normal">in {c.groupName}</span></span>
                            <span className="font-semibold text-green-700">+{c.amount.toLocaleString("en-IN", { style: "currency", currency: "INR" })}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Debtors Card (Accounts Payable) */}
                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2.5">
                        <div className="p-2 bg-red-50 text-red-600 border border-red-100 rounded-lg">
                          <ArrowDownRight className="w-4 h-4" strokeWidth={1.5} />
                        </div>
                        <div>
                          <h4 className="font-semibold text-sm text-slate-800">Accounts payable</h4>
                          <p className="text-[10px] text-slate-400 font-medium">Outstanding funds to repay</p>
                        </div>
                      </div>
                      <span className="font-bold text-base text-red-600">
                        {globalBalances?.debtors?.reduce((sum: number, d: any) => sum + d.amount, 0).toLocaleString("en-IN", { style: "currency", currency: "INR" }) || "₹0.00"}
                      </span>
                    </div>

                    <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1 custom-scrollbar">
                      {!globalBalances || globalBalances.debtors?.length === 0 ? (
                        <p className="text-xs text-slate-400 py-4 text-center font-medium">No outstanding payables.</p>
                      ) : (
                        globalBalances.debtors?.map((d: any, idx: number) => (
                          <div key={idx} className="flex items-center justify-between p-2.5 bg-red-50/20 border border-red-100/50 rounded-lg text-xs">
                            <span className="font-medium text-slate-700">{d.userName} <span className="text-[10px] text-slate-400 font-normal">in {d.groupName}</span></span>
                            <span className="font-semibold text-red-700">-{d.amount.toLocaleString("en-IN", { style: "currency", currency: "INR" })}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Middle Section grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Groups listing */}
              <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="font-semibold text-sm text-slate-800 flex items-center">
                    <Users className="w-4 h-4 mr-2 text-slate-400" strokeWidth={1.5} /> Reconciliation accounts
                  </h3>
                  <form 
                    onSubmit={e => { e.preventDefault(); handleCreateGroup(); }}
                    className="flex space-x-2"
                  >
                    <input 
                      type="text" 
                      value={newGroupName}
                      onChange={e => setNewGroupName(e.target.value)}
                      className="bg-white border border-slate-200 px-3 py-1.5 text-xs rounded-lg focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 text-slate-800 font-medium"
                      placeholder="New group name..."
                    />
                    <button 
                      type="submit"
                      className="bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-1.5 text-xs rounded-lg font-semibold transition-colors shadow-sm cursor-pointer"
                    >
                      Create
                    </button>
                  </form>
                </div>

                {loadingGroups ? (
                  <GroupSkeleton />
                ) : groups.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-12 text-slate-400 border border-dashed border-slate-200 rounded-xl">
                    <Users className="w-8 h-8 mb-2 text-slate-300 stroke-1" />
                    <p className="text-xs font-medium">No reconciliation accounts found.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {groups.map(g => (
                      <div 
                        key={g.id} 
                        onClick={() => { setSelectedGroupId(g.id); fetchGroupDetails(g.id); setGroupTab("overview"); setView("group-detail"); }}
                        className="p-4 bg-white border border-slate-200 rounded-xl hover:border-blue-500 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
                      >
                        <div>
                          <h4 className="font-semibold text-sm text-slate-800 group-hover:text-blue-600 transition-colors mb-1">{g.name}</h4>
                          <p className="text-xs text-slate-400 font-medium mb-4">{g.memberships.length} members active</p>
                        </div>
                        <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                          <div className="flex -space-x-1.5">
                            {g.memberships.slice(0, 4).map(m => (
                              <div key={m.id} className="w-6 h-6 rounded-full bg-slate-100 border border-white flex items-center justify-center text-[9px] font-bold text-blue-700" title={m.user.name}>
                                {m.user.name[0].toUpperCase()}
                              </div>
                            ))}
                            {g.memberships.length > 4 && (
                              <div className="w-6 h-6 rounded-full bg-slate-100 border border-white flex items-center justify-center text-[9px] font-bold text-slate-500">
                                +{g.memberships.length - 4}
                              </div>
                            )}
                          </div>
                          <span className="text-xs font-semibold text-blue-600 group-hover:translate-x-0.5 transition-transform flex items-center">
                            Open group <ArrowRight className="w-3.5 h-3.5 ml-1" strokeWidth={1.5} />
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent Ingestions */}
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col">
                <h3 className="font-semibold text-sm text-slate-800 mb-4 flex items-center">
                  <FileSpreadsheet className="w-4 h-4 mr-2 text-slate-400" strokeWidth={1.5} /> Recent ingestion files
                </h3>
                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1 flex-1 custom-scrollbar">
                  {importJobs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                      <FileSpreadsheet className="w-7 h-7 mb-1.5 text-slate-200 stroke-1" />
                      <p className="text-xs font-medium">No spreadsheets imported.</p>
                    </div>
                  ) : (
                    importJobs.map(j => (
                      <div key={j.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between text-xs font-medium">
                        <div className="space-y-0.5">
                          <p className="font-semibold text-slate-800 truncate max-w-[130px]">{j.rawFileName}</p>
                          <p className="text-[10px] text-slate-400 font-medium">{new Date(j.uploadedAt).toLocaleDateString()}</p>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold border ${
                          j.status === "COMPLETED" ? "bg-green-50 border-green-200 text-green-700" :
                          j.status === "REVIEW_REQUIRED" ? "bg-amber-50 border-amber-200 text-amber-700" :
                          "bg-slate-100 border-slate-200 text-slate-600"
                        }`}>
                          {j.status === "REVIEW_REQUIRED" ? "Review required" : j.status.toLowerCase()}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>

            {/* Structured Financial Ledger Audit Trail */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
              <h3 className="font-semibold text-sm text-slate-800 flex items-center">
                <Activity className="w-4 h-4 mr-2 text-slate-400" strokeWidth={1.5} /> Ledger audit trail
              </h3>
              
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                      <th className="py-2.5 px-4">Timestamp</th>
                      <th className="py-2.5 px-4">Operator</th>
                      <th className="py-2.5 px-4">Action event</th>
                      <th className="py-2.5 px-4 text-right">Reference amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dynamicTimeline.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-slate-400 font-medium">No audit logs written.</td>
                      </tr>
                    ) : (
                      dynamicTimeline.map((item) => (
                        <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50/50 text-slate-700 font-medium">
                          <td className="py-2.5 px-4 whitespace-nowrap text-slate-500 font-mono text-[10px]">
                            {new Date(item.date).toLocaleDateString("en-IN")} {new Date(item.date).toLocaleTimeString("en-IN", { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="py-2.5 px-4 font-semibold text-slate-800">
                            {item.user}
                          </td>
                          <td className="py-2.5 px-4">
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold border mr-2.5 ${
                              item.category === "Expense" ? "bg-blue-50 border-blue-100 text-blue-700" :
                              item.category === "Settlement" ? "bg-green-50 border-green-100 text-green-700" :
                              "bg-slate-100 border-slate-200 text-slate-600"
                            }`}>
                              {item.category}
                            </span>
                            <span className="text-slate-900">{item.title}</span>
                          </td>
                          <td className="py-2.5 px-4 text-right font-semibold text-slate-950">
                            {item.amount && item.category !== "Import" ? (
                              item.amount.toLocaleString("en-IN", { style: "currency", currency: "INR" })
                            ) : item.amount && item.category === "Import" ? (
                              `${item.amount} rows`
                            ) : "-"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
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
                { key: "balances", label: "Balances" },
                { key: "imports", label: "Imports" }
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
                  {/* Premium Financial Analytics Overview */}
                  {(() => {
                    const totalGroupExp = expenses.reduce((acc, e) => acc + e.normalizedAmount, 0);
                    const currentPeriodGroupExp = expenses
                      .filter(e => (Date.now() - new Date(e.expenseDate).getTime()) <= 30 * 24 * 60 * 60 * 1000)
                      .reduce((acc, e) => acc + e.normalizedAmount, 0);

                    const userSummary = balances?.summaries.find(s => s.userId === currentUser?.id);
                    const netBal = userSummary ? userSummary.netBalance : 0;
                    const isCreditor = netBal > 0.01;
                    const isDebtor = netBal < -0.01;

                    const activeMembersCount = selectedGroup.memberships.filter(m => !m.leftAt).length;
                    const pendingSettlementsCount = balances?.simplifiedDebts.length || 0;

                    return (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className={`p-4 bg-white border border-slate-200 rounded-xl shadow-sm flex items-center space-x-3.5 ${
                          isCreditor ? "border-l-4 border-l-green-500" : isDebtor ? "border-l-4 border-l-red-500" : ""
                        }`}>
                          <div className={`p-2 rounded-lg border ${
                            isCreditor ? "bg-green-50 text-green-600 border-green-100" : 
                            isDebtor ? "bg-red-50 text-red-600 border-red-100" : 
                            "bg-slate-50 text-slate-500 border-slate-100"
                          }`}>
                            {isCreditor ? <ArrowUpRight className="w-5 h-5" strokeWidth={1.5} /> : 
                             isDebtor ? <ArrowDownRight className="w-5 h-5" strokeWidth={1.5} /> : 
                             <ArrowRightLeft className="w-5 h-5" strokeWidth={1.5} />}
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Net balance</p>
                            <p className={`font-bold text-base ${isCreditor ? "text-green-600" : isDebtor ? "text-red-600" : "text-slate-900"}`}>
                              {isCreditor ? "+" : ""}{netBal.toLocaleString("en-IN", { style: "currency", currency: "INR" })}
                            </p>
                          </div>
                        </div>

                        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm flex items-center space-x-3.5">
                          <div className="p-2.5 bg-blue-50 text-blue-600 border border-blue-100 rounded-lg"><Receipt className="w-5 h-5" strokeWidth={1.5} /></div>
                          <div>
                            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Total expenses</p>
                            <p className="font-bold text-base text-slate-900">{totalGroupExp.toLocaleString("en-IN", { style: "currency", currency: "INR" })}</p>
                            <p className="text-[9px] text-slate-400 font-medium">₹{currentPeriodGroupExp.toLocaleString("en-IN")} this month</p>
                          </div>
                        </div>

                        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm flex items-center space-x-3.5">
                          <div className="p-2.5 bg-slate-100 text-slate-600 border border-slate-200 rounded-lg"><Users className="w-5 h-5" strokeWidth={1.5} /></div>
                          <div>
                            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Active members</p>
                            <p className="font-bold text-base text-slate-900">{activeMembersCount} / {selectedGroup.memberships.length}</p>
                          </div>
                        </div>

                        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm flex items-center space-x-3.5">
                          <div className="p-2.5 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-lg"><CheckCircle className="w-5 h-5" strokeWidth={1.5} /></div>
                          <div>
                            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Settlement status</p>
                            <p className="font-bold text-base text-slate-900">
                              {pendingSettlementsCount === 0 ? "Fully reconciled" : `${pendingSettlementsCount} outstanding`}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Quick CSV Import Trigger */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div>
                      <h4 className="font-semibold text-slate-800 text-xs">Ingest spreadsheet data</h4>
                      <p className="text-[11px] text-slate-500 mt-0.5">Reconcile raw transaction statements and execute pipeline safety rules.</p>
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
                        className="flex-1 sm:flex-none bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-4 py-2 text-xs font-semibold rounded-lg cursor-pointer text-center transition-colors shadow-sm"
                      >
                        {importFile ? importFile.name : "Select CSV file"}
                      </label>
                      {importFile && (
                        <button
                          onClick={() => handleUploadCsv()}
                          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-xs font-semibold rounded-lg cursor-pointer transition-all shadow-sm"
                        >
                          Analyze
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right side widgets: Active Members list */}
                <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm h-fit space-y-4">
                  <h4 className="font-semibold text-slate-800 text-xs flex items-center">
                    <Users className="w-3.5 h-3.5 mr-1.5 text-slate-400" strokeWidth={1.5} /> Active members
                  </h4>
                  <div className="space-y-3">
                    {selectedGroup.memberships.map(m => (
                      <div key={m.id} className="flex items-center justify-between text-xs font-medium">
                        <div className="flex items-center space-x-2">
                          <div className="w-5 h-5 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-[9px] font-bold text-slate-700">
                            {m.user.name[0].toUpperCase()}
                          </div>
                          <span className="text-slate-700">{m.user.name}</span>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold border ${
                          m.leftAt ? "bg-red-50 border-red-200 text-red-700" : "bg-green-50 border-green-200 text-green-700"
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
                              m.leftAt ? "bg-red-50 border border-red-200 text-red-700" : "bg-green-50 border border-green-200 text-green-700"
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

          {groupTab === "balances" && (
            <div className="space-y-6 animate-fade-in">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  
                  {/* Balance ledger card */}
                  <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col justify-between">
                    <div>
                      <h3 className="font-semibold text-sm text-slate-800 mb-4 flex items-center">
                        <ArrowRightLeft className="w-4 h-4 mr-2 text-slate-400" strokeWidth={1.5} /> Group balances
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
                                className={`p-4 border rounded-xl flex items-center justify-between transition-all cursor-pointer shadow-sm hover:shadow-md ${
                                  isCreditor ? "bg-green-50/10 border-green-200 hover:border-green-350" :
                                  isDebtor ? "bg-red-50/10 border-red-200 hover:border-red-350" :
                                  "bg-slate-50 border-slate-200 hover:border-slate-305"
                                }`}
                              >
                                <div className="flex items-center space-x-3">
                                  <div className={`w-8.5 h-8.5 rounded-lg flex items-center justify-center font-bold text-xs ${
                                    isCreditor ? "bg-green-50 text-green-700 border border-green-100" :
                                    isDebtor ? "bg-red-50 text-red-700 border border-red-100" :
                                    "bg-slate-100 text-slate-600 border border-slate-200"
                                  }`}>
                                    {s.userName[0].toUpperCase()}
                                  </div>
                                  <div>
                                    <h4 className="font-semibold text-xs text-slate-800">{s.userName}</h4>
                                    <div className="flex items-center space-x-1.5 mt-0.5 text-[10px] text-slate-400 font-medium">
                                      <span>Click to audit balance history</span>
                                      {isCreditor && <ArrowUpRight className="w-3.5 h-3.5 text-green-600" strokeWidth={1.5} />}
                                      {isDebtor && <ArrowDownRight className="w-3.5 h-3.5 text-red-600" strokeWidth={1.5} />}
                                    </div>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <p className={`font-bold text-xs ${
                                    isCreditor ? "text-green-600" :
                                    isDebtor ? "text-red-600" :
                                    "text-slate-500"
                                  }`}>
                                    {isCreditor ? "+" : ""}{s.netBalance.toLocaleString("en-IN", { style: "currency", currency: "INR" })}
                                  </p>
                                  <span className={`inline-block text-[9px] font-bold px-1.5 py-0.5 rounded border mt-1 ${
                                    isCreditor ? "bg-green-50 border-green-200 text-green-700" :
                                    isDebtor ? "bg-red-50 border-red-200 text-red-700" :
                                    "bg-slate-100 border-slate-200 text-slate-500"
                                  }`}>
                                    {isCreditor ? "Gets back" : isDebtor ? "Owes" : "Settled"}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-550 py-4 text-center font-medium">No balance details computed.</p>
                      )}
                    </div>
                  </div>

                  {/* Debt optimization plans */}
                  <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm h-fit">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold text-xs text-slate-805 flex items-center">
                        <CheckCircle className="w-3.5 h-3.5 mr-1.5 text-green-600" strokeWidth={1.5} /> Simplified debt plan
                      </h3>
                      <div className="flex items-center space-x-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                        <button
                          onClick={() => setShowOptimized(false)}
                          className={`px-2 py-1 text-[9px] font-semibold rounded-md transition-all cursor-pointer ${
                            !showOptimized 
                              ? "bg-white text-slate-800 shadow-sm border border-slate-200/50" 
                              : "text-slate-550 hover:text-slate-800"
                          }`}
                        >
                          Raw
                        </button>
                        <button
                          onClick={() => setShowOptimized(true)}
                          className={`px-2 py-1 text-[9px] font-semibold rounded-md transition-all cursor-pointer ${
                            showOptimized 
                              ? "bg-white text-slate-800 shadow-sm border border-slate-200/50" 
                              : "text-slate-550 hover:text-slate-800"
                          }`}
                        >
                          Optimized
                        </button>
                      </div>
                    </div>

                    {/* Transaction count reduction banner */}
                    {showOptimized && balances && balances.simplifiedDebts.length < rawDebts.length && (
                      <div className="mb-4 p-3 bg-blue-50 border border-blue-100 rounded-lg flex items-center space-x-2 text-[10px] font-medium text-blue-800">
                        <Sparkles className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" strokeWidth={1.5} />
                        <div>
                          Debt optimized: <b>{rawDebts.length}</b> transactions reduced to <b>{balances.simplifiedDebts.length}</b>!
                        </div>
                      </div>
                    )}

                    {(() => {
                      const debtsToRender = showOptimized 
                        ? (balances?.simplifiedDebts || []) 
                        : rawDebts;

                      if (debtsToRender.length === 0) {
                        return (
                          <div className="flex flex-col items-center justify-center py-8 text-slate-400">
                            <CheckCircle className="w-6 h-6 mb-1.5 text-green-500 stroke-1" strokeWidth={1.5} />
                            <p className="text-xs font-medium">No outstanding debts.</p>
                          </div>
                        );
                      }

                      return (
                        <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1 custom-scrollbar">
                          {debtsToRender.map((d, idx) => (
                            <div key={idx} className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between text-xs font-medium">
                              <div className="flex items-center space-x-2 text-slate-700">
                                <span className="font-semibold text-slate-800">{d.fromUser}</span>
                                <ArrowRight className="w-3.5 h-3.5 text-slate-400" strokeWidth={1.5} />
                                <span className="font-semibold text-slate-800">{d.toUser}</span>
                              </div>
                              <span className="font-semibold text-blue-700 bg-blue-50/50 border border-blue-100 px-2 py-0.5 rounded text-[11px]">
                                {d.amount.toLocaleString("en-IN", { style: "currency", currency: "INR" })}
                              </span>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                </div>
              </div>
            </div>
          )}

            {/* TAB CONTENT: IMPORTS */}
            {groupTab === "imports" && (
              <div className="space-y-6 animate-fade-in">
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
                  <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/20">
                    <div>
                      <h3 className="font-semibold text-sm text-slate-900 flex items-center">
                        <FileSpreadsheet className="w-4 h-4 mr-2 text-slate-500" strokeWidth={1.5} /> Spreadsheet reconciliation history
                      </h3>
                      <p className="text-[11px] text-slate-400 font-medium mt-0.5">Audit log of all imported CSV spreadsheet jobs</p>
                    </div>
                    <div className="text-xs font-semibold text-slate-500 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg">
                      Total spreadsheets imported: {importJobs.filter(j => j.groupId === selectedGroupId).length}
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 text-slate-500 font-semibold text-[10px] border-b border-slate-200">
                          <th className="py-3 px-5">File name</th>
                          <th className="py-3 px-5">Status</th>
                          <th className="py-3 px-5">Imported date</th>
                          <th className="py-3 px-5">Summary details</th>
                          <th className="py-3 px-5 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importJobs.filter(j => j.groupId === selectedGroupId).length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-12 text-center text-slate-400 font-medium">
                              <FileSpreadsheet className="w-8 h-8 mx-auto text-slate-300 stroke-1 mb-2" />
                              No spreadsheets reconciled for this group yet
                            </td>
                          </tr>
                        ) : (
                          importJobs.filter(j => j.groupId === selectedGroupId).map(j => {
                            const dateStr = new Date(j.uploadedAt).toLocaleString("en-IN", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit"
                            });
                            return (
                              <tr key={j.id} className="border-b border-slate-100 hover:bg-slate-50/50 text-xs text-slate-700 font-medium animate-fade-in">
                                <td className="py-3.5 px-5 font-semibold text-slate-900 truncate max-w-[200px]" title={j.rawFileName}>
                                  {j.rawFileName}
                                </td>
                                <td className="py-3.5 px-5">
                                  <span className={`inline-block px-2 py-0.5 rounded text-[9px] font-bold border ${
                                    j.status === "COMPLETED" ? "bg-green-50 border-green-200 text-green-700" :
                                    j.status === "REVIEW_REQUIRED" ? "bg-amber-50 border-amber-250 text-amber-700" :
                                    "bg-slate-50 border-slate-200 text-slate-600"
                                  }`}>
                                    {j.status === "COMPLETED" ? "Completed" : j.status === "REVIEW_REQUIRED" ? "Review required" : j.status.toLowerCase()}
                                  </span>
                                </td>
                                <td className="py-3.5 px-5 text-slate-400 font-mono text-[10px]">
                                  {dateStr}
                                </td>
                                <td className="py-3.5 px-5 text-slate-550">
                                  {j.summary ? (
                                    <div className="flex space-x-3 text-[10px]">
                                      <span>Rows: <b className="text-slate-700">{j.summary.rowsProcessed}</b></span>
                                      <span className="text-green-600">Expenses: <b className="font-semibold">+{j.summary.expensesCreated}</b></span>
                                      <span className="text-blue-600">Settlements: <b className="font-semibold">+{j.summary.settlementsCreated}</b></span>
                                      <span className="text-amber-600">Anomalies: <b className="font-semibold">{j.anomaliesCount || 0}</b></span>
                                    </div>
                                  ) : (
                                    <span className="text-slate-405 italic">No summary computed</span>
                                  )}
                                </td>
                                <td className="py-3.5 px-5 text-right">
                                  <button
                                    onClick={async () => {
                                      try {
                                        const res = await api.get(`/imports/jobs/${j.id}`);
                                        setSelectedImportJob(res.data);
                                      } catch (err) {
                                        showToast("Failed to fetch import job details", "error");
                                      }
                                    }}
                                    className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold px-3 py-1.5 rounded-lg text-[10px] cursor-pointer transition-colors shadow-sm inline-flex items-center"
                                  >
                                    View report details
                                  </button>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* VIEW: CSV IMPORT QUEUE (REVIEW WORKFLOW REDESIGN) */}
        {view === "import" && selectedGroup && activeImportJobId && (
          <div className="space-y-6 animate-fade-in">
            
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <button 
                onClick={() => { setView("group-detail"); setImportStats(null); setImportStep(1); }}
                className="text-slate-500 hover:text-slate-800 flex items-center text-xs font-semibold transition-colors cursor-pointer"
              >
                <ArrowRight className="w-4 h-4 mr-1 rotate-180" strokeWidth={1.5} /> Cancel and return
              </button>
              <h2 className="text-sm font-semibold text-slate-900 flex items-center">
                <FileSpreadsheet className="w-5 h-5 text-blue-600 mr-2" strokeWidth={1.5} /> Spreadsheet reconciliation pipeline
              </h2>
            </div>

            {/* Guided Stepper Horizontal Progress Bar */}
            <div className="flex items-center justify-between mb-8 max-w-3xl mx-auto border-b border-slate-100 pb-4">
              {[
                { step: 1, label: "Upload" },
                { step: 2, label: "Parsing" },
                { step: 3, label: "Detection" },
                { step: 4, label: "Review" },
                { step: 5, label: "Finalize" },
                { step: 6, label: "Completed" }
              ].map((s, idx, arr) => (
                <React.Fragment key={s.step}>
                  <div className="flex items-center space-x-2">
                    <div className={`w-6.5 h-6.5 rounded-full flex items-center justify-center font-bold text-[10px] border transition-all ${
                      importStep === s.step 
                        ? "bg-blue-600 border-blue-600 text-white shadow-sm ring-4 ring-blue-50" 
                        : importStep > s.step 
                          ? "bg-green-600 border-green-600 text-white" 
                          : "bg-slate-50 border-slate-200 text-slate-400"
                    }`}>
                      {importStep > s.step ? "✓" : s.step}
                    </div>
                    <span className={`text-xs font-semibold ${
                      importStep === s.step ? "text-slate-850" : "text-slate-400"
                    }`}>{s.label}</span>
                  </div>
                  {idx < arr.length - 1 && (
                    <div className={`flex-1 h-0.5 mx-2 transition-all ${
                      importStep > s.step ? "bg-green-500" : "bg-slate-200"
                    }`}></div>
                  )}
                </React.Fragment>
              ))}
            </div>

            {/* Stepper Loader View: Parsing */}
            {importStep === 2 && !duplicateBatchError && (
              <div className="text-center py-16 space-y-4 bg-white border border-slate-200 rounded-xl max-w-md mx-auto shadow-sm animate-fade-in">
                <div className="animate-spin w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full mx-auto"></div>
                <div>
                  <h3 className="font-semibold text-slate-800 text-sm">Parsing transactions...</h3>
                  <p className="text-xs text-slate-400 mt-1">Reading raw row content and converting currency representations.</p>
                </div>
              </div>
            )}

            {/* Stepper Loader View: Duplicate Batch Error */}
            {importStep === 2 && duplicateBatchError && (
              <div className="max-w-md mx-auto bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-5 animate-fade-in">
                <div className="flex items-center space-x-3 text-amber-500">
                  <ShieldAlert className="w-8 h-8 shrink-0 text-amber-600" strokeWidth={1.5} />
                  <div>
                    <h3 className="font-semibold text-slate-850 text-sm">Duplicate CSV Import Detected</h3>
                    <p className="text-xs text-slate-400 font-medium">{duplicateBatchError.message}</p>
                  </div>
                </div>

                <p className="text-xs text-slate-500 font-medium leading-relaxed">
                  Ledgerly has detected that the exact same CSV spreadsheet has already been successfully reconciled and imported into this group. Re-importing it normally will duplicate expenses and corrupt your ledger balances.
                </p>

                <div className="flex flex-col gap-2.5 pt-2">
                  <button
                    onClick={async () => {
                      const jobId = duplicateBatchError.jobId;
                      setDuplicateBatchError(null);
                      setImportFile(null);
                      try {
                        const res = await api.get(`/imports/jobs/${jobId}`);
                        setSelectedImportJob(res.data);
                      } catch (e) {
                        showToast("Failed to fetch previous import job details.", "error");
                      }
                    }}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold py-2 rounded-lg transition-all shadow-sm cursor-pointer"
                  >
                    👀 View previous import
                  </button>

                  <button
                    onClick={() => handleUploadCsv("DEMO")}
                    className="w-full bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold py-2 rounded-lg transition-all shadow-sm cursor-pointer"
                  >
                    🔁 Re-run import (Demo Mode)
                  </button>

                  <button
                    onClick={() => handleUploadCsv("FORCE")}
                    className="w-full bg-slate-700 hover:bg-slate-800 text-white text-xs font-semibold py-2 rounded-lg transition-all shadow-sm cursor-pointer"
                  >
                    ➕ Force new import (Admin Mode)
                  </button>

                  <button
                    onClick={() => {
                      setDuplicateBatchError(null);
                      setImportStep(1);
                      setView("group-detail");
                    }}
                    className="w-full bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold py-2 rounded-lg transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Stepper Loader View: Detection */}
            {importStep === 3 && (
              <div className="text-center py-16 space-y-4 bg-white border border-slate-200 rounded-xl max-w-md mx-auto shadow-sm animate-fade-in">
                <div className="animate-spin w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full mx-auto"></div>
                <div>
                  <h3 className="font-semibold text-slate-800 text-sm">Detecting anomalies...</h3>
                  <p className="text-xs text-slate-400 mt-1">Scanning for duplicate rows, missing payers, and date ambiguities.</p>
                </div>
              </div>
            )}

            {/* Stepper Loader View: Finalizing */}
            {importStep === 5 && (
              <div className="text-center py-16 space-y-4 bg-white border border-slate-200 rounded-xl max-w-md mx-auto shadow-sm animate-fade-in">
                <div className="animate-spin w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full mx-auto"></div>
                <div>
                  <h3 className="font-semibold text-slate-800 text-sm">Finalizing ledger...</h3>
                  <p className="text-xs text-slate-400 mt-1">Applying resolution mappings, writing ledger logs, and updating balances.</p>
                </div>
              </div>
            )}

            {/* Stepper Stage 6: Completed Summary Report */}
            {importStep === 6 && importStats && (
              <div className="max-w-xl w-full mx-auto bg-white border border-slate-200 rounded-xl p-8 shadow-sm text-center space-y-6 animate-fade-in">
                <div className="w-12 h-12 bg-green-50 text-green-600 rounded-full flex items-center justify-center mx-auto mb-2 border border-green-100">
                  <CheckCircle className="w-6 h-6" strokeWidth={1.5} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Import completed</h3>
                  <p className="text-slate-450 text-xs mt-1">Audit resolution logs written and new entries committed to group ledger.</p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 p-4 bg-slate-50 border border-slate-200 rounded-xl text-left text-xs text-slate-500 font-medium">
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Rows processed</p>
                    <p className="font-bold text-slate-800 text-sm">{importStats.rowsProcessed}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Valid entries</p>
                    <p className="font-bold text-slate-850 text-sm">
                      {importStats.rowsProcessed - Object.values(importResolutions).filter(r => r.resolutionAction === "REJECT_ROW").length}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Anomalies resolved</p>
                    <p className="font-bold text-slate-850 text-sm">
                      {Object.values(importResolutions).filter(r => r.resolutionAction !== null && r.resolutionAction !== "REJECT_ROW").length}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-405 font-bold uppercase tracking-wider mb-1">Users mapped</p>
                    <p className="font-bold text-slate-850 text-sm">
                      {Object.values(importResolutions).filter(r => r.resolutionAction === "MAPPED_USER").length}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-405 font-bold uppercase tracking-wider mb-1">Ledger entries created</p>
                    <p className="font-bold text-slate-850 text-sm">
                      {importStats.expensesCreated + importStats.settlementsCreated}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Ingestion duration</p>
                    <p className="font-bold text-slate-855 text-sm">
                      {importStartTime ? ((Date.now() - importStartTime) / 1000).toFixed(1) : "0.0"}s
                    </p>
                  </div>
                </div>

                <div className="border border-slate-200 p-4 rounded-lg text-left text-xs bg-white space-y-2">
                  <p className="font-semibold text-slate-800">Entity mapping context</p>
                  <div className="space-y-1 text-slate-500 font-medium">
                    <p>• Destination Account: <span className="font-semibold text-slate-855">{selectedGroup.name}</span></p>
                    <p>• Total Resolution Directives Applied: <span className="font-semibold text-slate-855">{Object.values(importResolutions).filter(r => r.resolutionAction !== null).length} items</span></p>
                  </div>
                </div>

                <button 
                  onClick={() => { setView("group-detail"); setImportStats(null); setImportStep(1); }}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs px-5 py-2 rounded-lg cursor-pointer transition-all shadow-sm"
                >
                  View group balances
                </button>
              </div>
            )}

            {/* Stepper Stage 4: Review Anomalies List */}
            {importStep === 4 && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
                
                {/* Resolution queue */}
                <div className="lg:col-span-2 space-y-4">
                  
                  {/* Bulk Actions controls */}
                  <div className="flex flex-wrap gap-3 items-center justify-between bg-slate-50 border border-slate-200 p-4 rounded-xl">
                    <div className="text-xs font-semibold text-slate-700">
                      Bulk resolutions
                    </div>
                    <div className="flex space-x-3">
                      <button 
                        onClick={handleBulkIgnoreInfo}
                        className="bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs px-3 py-1.5 font-semibold rounded-lg cursor-pointer transition-colors shadow-sm"
                      >
                        Ignore info alerts
                      </button>
                      <button 
                        onClick={handleBulkAutoResolveSafe}
                        className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1.5 font-semibold rounded-lg cursor-pointer transition-all shadow-sm"
                      >
                        Apply safe fixes
                      </button>
                    </div>
                  </div>

                  {/* Severity tabs */}
                  <div className="flex border-b border-slate-200 space-x-5 text-xs font-medium">
                    {(["ALL", "BLOCKING", "ERROR", "WARNING", "INFO"] as const).map(tab => {
                      const count = tab === "ALL" 
                        ? activeImportAnomalies.length 
                        : activeImportAnomalies.filter(a => a.severity === tab).length;
                      
                      const isActive = anomalyTab === tab;
                      return (
                        <button
                          key={tab}
                          onClick={() => setAnomalyTab(tab)}
                          className={`pb-2 border-b-2 transition-all cursor-pointer font-semibold ${
                            isActive 
                              ? "border-blue-600 text-blue-600 font-bold" 
                              : "border-transparent text-slate-400 hover:text-slate-600"
                          }`}
                        >
                          {tab === "ALL" ? "All" : tab} ({count})
                        </button>
                      );
                    })}
                  </div>
                  
                  {(() => {
                    const filteredAnomalies = activeImportAnomalies.filter(a => {
                      if (anomalyTab === "ALL") return true;
                      return a.severity === anomalyTab;
                    });

                    if (filteredAnomalies.length === 0) {
                      return (
                        <div className="p-8 bg-white border border-slate-200 rounded-xl text-center space-y-3 shadow-sm">
                          <div className="w-10 h-10 bg-green-50 text-green-600 rounded-full flex items-center justify-center mx-auto border border-green-150">
                            <CheckCircle className="w-5 h-5" strokeWidth={1.5} />
                          </div>
                          <h3 className="font-semibold text-slate-800 text-xs">No anomalies in this view</h3>
                          <p className="text-xs text-slate-405 font-medium">All scanned items are clean or resolved under this severity filter.</p>
                        </div>
                      );
                    }

                    return filteredAnomalies.map(a => {
                      const resolution = importResolutions[a.fingerprint];
                      const isResolved = resolution && resolution.resolutionAction !== null;

                      // Fix description mapping:
                      let fixText = "Acknowledge and accept validation warning.";
                      if (a.anomalyType === "MISSING_PAYER") {
                        fixText = "Select an active group member to map as payer for this expense.";
                      } else if (a.anomalyType === "UNKNOWN_USER") {
                        fixText = "Map the unknown name token to an active group member name.";
                      } else if (a.anomalyType === "AMBIGUOUS_DATE") {
                        fixText = "Explicitly choose the correct date format order (DD/MM vs MM/DD).";
                      } else if (a.anomalyType === "SETTLEMENT_DISGUISED_AS_EXPENSE") {
                        fixText = "Convert expense format into a direct repayment settlement transaction.";
                      } else if (a.anomalyType === "DUPLICATE") {
                        fixText = "Discard duplicate transaction row or approve force import.";
                      } else if (a.anomalyType === "MEMBERSHIP_VIOLATION") {
                        fixText = "Exclude member from split or exclude entire row.";
                      } else if (a.anomalyType === "INVALID_PERCENT_SPLIT") {
                        fixText = "Adjust participant percentages to sum to exactly 100% or exclude row.";
                      } else if (a.anomalyType === "INVALID_EXACT_SPLIT") {
                        fixText = "Adjust participant amounts to sum to exactly the total amount or exclude row.";
                      }

                      return (
                        <div 
                          key={a.id}
                          className={`p-5 bg-white border rounded-xl shadow-sm transition-all space-y-4 ${
                            isResolved ? "border-green-500 bg-green-50/5" :
                            a.severity === "BLOCKING" ? "border-red-400" :
                            a.severity === "ERROR" ? "border-amber-400" :
                            "border-slate-200"
                          }`}
                        >
                          <div className="flex items-center justify-between text-xs font-semibold">
                            <span className="text-slate-400">Row {a.rowNumber} • {a.anomalyType.toLowerCase().replace(/_/g, ' ')}</span>
                            <span className={`px-2 py-0.5 rounded text-[9px] font-bold border ${
                              a.severity === "BLOCKING" ? "bg-red-50 border-red-200 text-red-700" :
                               a.severity === "ERROR" ? "bg-amber-50 border-amber-200 text-amber-700" :
                              a.severity === "WARNING" ? "bg-yellow-50 border-yellow-200 text-yellow-700" :
                              "bg-slate-50 border-slate-200 text-slate-600"
                            }`}>
                              {a.severity.toLowerCase()}
                            </span>
                          </div>

                          <div>
                            <h4 className="font-semibold text-xs text-slate-800">{a.description}</h4>
                            <div className="text-[10px] text-slate-400 font-medium mt-1">Rule: {a.fingerprint.split("_").slice(0, 3).join(" ").toLowerCase()}</div>
                          </div>

                          {/* Side-by-side Before/After Diff Block */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-medium">
                            {/* Before (Original CSV) */}
                            <div className="space-y-1 sm:border-r border-slate-250 sm:pr-2">
                              <p className="font-bold text-[9px] uppercase tracking-wider text-slate-400 mb-1.5 flex items-center">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-400 mr-1.5"></span> Original Row Content
                              </p>
                              <div className="truncate text-slate-500"><b>Date:</b> {a.rawRow.date || "-"}</div>
                              <div className="truncate text-slate-500"><b>Description:</b> {a.rawRow.description || "-"}</div>
                              <div className="truncate text-slate-500"><b>Paid By:</b> {a.rawRow.paid_by || "-"}</div>
                              <div className="truncate text-slate-500"><b>Amount:</b> {a.rawRow.amount} {a.rawRow.currency || ""}</div>
                            </div>

                            {/* After (Resolved Output) */}
                            <div className="space-y-1 sm:pl-2">
                              <p className="font-bold text-[9px] uppercase tracking-wider text-slate-400 mb-1.5 flex items-center">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5"></span> Adjusted Output Ledger
                              </p>
                              {(() => {
                                const res = importResolutions[a.fingerprint];
                                const isExcluded = res?.resolutionAction === "REJECT_ROW";
                                const isSettlement = res?.resolutionAction === "CONVERTED_TO_SETTLEMENT";
                                
                                if (isExcluded) {
                                  return <div className="text-red-600 font-semibold italic py-2">Row excluded (will not be imported)</div>;
                                }

                                let finalDate = a.rawRow.date;
                                if (res?.resolutionDetails?.selectedDate) {
                                  finalDate = new Date(res.resolutionDetails.selectedDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
                                }

                                let finalPaidBy = a.rawRow.paid_by;
                                if (res?.resolutionAction === "MAPPED_USER" && res?.resolutionDetails?.to) {
                                  finalPaidBy = res.resolutionDetails.to;
                                }

                                return (
                                  <>
                                    <div className={`truncate ${res?.resolutionDetails?.selectedDate ? "text-green-600 font-semibold" : "text-slate-500"}`}>
                                      <b>Date:</b> {finalDate}
                                    </div>
                                    <div className="truncate text-slate-500"><b>Description:</b> {a.rawRow.description || "-"}</div>
                                    <div className={`truncate ${res?.resolutionAction === "MAPPED_USER" ? "text-green-600 font-semibold" : "text-slate-500"}`}>
                                      <b>Paid by:</b> {finalPaidBy}
                                    </div>
                                    <div className={`truncate ${isSettlement ? "text-blue-600 font-semibold" : "text-slate-500"}`}>
                                      <b>Type:</b> {isSettlement ? "Settlement" : "Expense"}
                                    </div>
                                    <div className="truncate text-slate-500">
                                      <b>Amount:</b> {a.rawRow.amount} {a.rawRow.currency || "INR"}
                                    </div>
                                  </>
                                );
                              })()}
                            </div>
                          </div>

                          {/* Suggested Fix Action Panel */}
                          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-2.5">
                            <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                              Suggested fix: <span className="font-normal normal-case text-slate-600">{fixText}</span>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              {/* Missing Payer */}
                              {a.anomalyType === "MISSING_PAYER" && (
                                <div className="flex flex-wrap gap-2 w-full">
                                  {selectedGroup.memberships.map(m => (
                                    <button
                                      key={m.id}
                                      onClick={() => handleResolveAnomaly(a.fingerprint, "MAPPED_USER", { from: "", to: m.user.name })}
                                      className={`px-3 py-1.5 rounded-lg border font-semibold cursor-pointer transition-all ${
                                        resolution?.resolutionDetails?.to === m.user.name
                                          ? "bg-blue-600 border-blue-500 text-white"
                                          : "bg-white border-slate-300 hover:bg-slate-100 text-slate-700"
                                      }`}
                                    >
                                      {m.user.name}
                                    </button>
                                  ))}
                                </div>
                              )}

                              {/* Unknown User Mapping */}
                              {a.anomalyType === "UNKNOWN_USER" && (
                                <div className="flex flex-wrap gap-2 w-full">
                                  {selectedGroup.memberships.map(m => {
                                    const match = a.description.match(/Unknown user '(.+)' detected/);
                                    const rawName = match ? match[1] : a.rawRow.paid_by || "";
                                    return (
                                      <button
                                        key={m.id}
                                        onClick={() => handleResolveAnomaly(a.fingerprint, "MAPPED_USER", { from: rawName, to: m.user.name })}
                                        className={`px-3 py-1.5 rounded-lg border font-semibold cursor-pointer transition-all ${
                                          resolution?.resolutionDetails?.to === m.user.name
                                            ? "bg-blue-600 border-blue-500 text-white"
                                            : "bg-white border-slate-300 hover:bg-slate-100 text-slate-700"
                                        }`}
                                      >
                                        {m.user.name}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}

                              {/* Ambiguous Date Selector */}
                              {a.anomalyType === "AMBIGUOUS_DATE" && (
                                <div className="flex flex-wrap gap-2 w-full">
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
                                          className={`px-3 py-1.5 rounded-lg border font-semibold cursor-pointer transition-all ${
                                            resolution?.resolutionDetails?.selectedDate === d1
                                              ? "bg-blue-600 border-blue-500 text-white"
                                              : "bg-white border-slate-300 hover:bg-slate-100 text-slate-700"
                                          }`}
                                        >
                                          {label1} (DD-MM)
                                        </button>
                                        <button 
                                          onClick={() => handleResolveAnomaly(a.fingerprint, "ACCEPTED_WARNING", { selectedDate: d2 })}
                                          className={`px-3 py-1.5 rounded-lg border font-semibold cursor-pointer transition-all ${
                                            resolution?.resolutionDetails?.selectedDate === d2
                                              ? "bg-blue-600 border-blue-500 text-white"
                                              : "bg-white border-slate-300 hover:bg-slate-100 text-slate-700"
                                          }`}
                                        >
                                          {label2} (MM-DD)
                                        </button>
                                      </>
                                    );
                                  })()}
                                </div>
                              )}

                              {/* Repayment Disguised */}
                              {a.anomalyType === "SETTLEMENT_DISGUISED_AS_EXPENSE" && (
                                <div className="flex space-x-2">
                                  <button 
                                    onClick={() => handleResolveAnomaly(a.fingerprint, "CONVERTED_TO_SETTLEMENT")}
                                    className={`px-3 py-1.5 rounded-lg border font-semibold cursor-pointer transition-all ${
                                      resolution?.resolutionAction === "CONVERTED_TO_SETTLEMENT"
                                        ? "bg-blue-600 border-blue-500 text-white"
                                        : "bg-white border-slate-300 hover:bg-slate-100 text-slate-700"
                                    }`}
                                  >
                                    Convert to repayment
                                  </button>
                                  <button 
                                    onClick={() => handleResolveAnomaly(a.fingerprint, "ACCEPTED_WARNING")}
                                    className={`px-3 py-1.5 rounded-lg border font-semibold cursor-pointer transition-all ${
                                      resolution?.resolutionAction === "ACCEPTED_WARNING"
                                        ? "bg-slate-200 border-slate-300 text-slate-800"
                                        : "bg-white border-slate-300 hover:bg-slate-100 text-slate-750"
                                    }`}
                                  >
                                    Keep as expense
                                  </button>
                                </div>
                              )}

                              {/* Duplicate checking */}
                              {a.anomalyType === "DUPLICATE" && (
                                <div className="flex space-x-2">
                                  <button 
                                    onClick={() => handleResolveAnomaly(a.fingerprint, "REJECT_ROW")}
                                    className={`px-3 py-1.5 rounded-lg border font-semibold cursor-pointer transition-all ${
                                      resolution?.resolutionAction === "REJECT_ROW"
                                        ? "bg-red-600 border-red-500 text-white"
                                        : "bg-white border-slate-300 hover:bg-slate-100 text-red-600"
                                    }`}
                                  >
                                    Discard duplicate
                                  </button>
                                  <button 
                                    onClick={() => handleResolveAnomaly(a.fingerprint, "APPROVED_DUPLICATE")}
                                    className={`px-3 py-1.5 rounded-lg border font-semibold cursor-pointer transition-all ${
                                      resolution?.resolutionAction === "APPROVED_DUPLICATE"
                                        ? "bg-green-600 border-green-500 text-white"
                                        : "bg-white border-slate-300 hover:bg-slate-100 text-slate-700"
                                    }`}
                                  >
                                    Force import
                                  </button>
                                </div>
                              )}

                              {/* Safe Warnings */}
                              {["MISSING_CURRENCY", "NEGATIVE_AMOUNT", "ZERO_AMOUNT", "MEMBERSHIP_VIOLATION"].includes(a.anomalyType) && (
                                <div className="flex space-x-2">
                                  <button 
                                    onClick={() => handleResolveAnomaly(a.fingerprint, "ACCEPTED_WARNING")}
                                    className={`px-3 py-1.5 rounded-lg border font-semibold cursor-pointer transition-all ${
                                      resolution?.resolutionAction === "ACCEPTED_WARNING"
                                        ? "bg-blue-600 border-blue-500 text-white"
                                        : "bg-white border-slate-300 hover:bg-slate-100 text-slate-700"
                                    }`}
                                  >
                                    Acknowledge & accept
                                  </button>
                                  {a.anomalyType === "MEMBERSHIP_VIOLATION" && (
                                    <button 
                                      onClick={() => handleResolveAnomaly(a.fingerprint, "REJECT_ROW")}
                                      className={`px-3 py-1.5 rounded-lg border font-semibold cursor-pointer transition-all ${
                                        resolution?.resolutionAction === "REJECT_ROW"
                                          ? "bg-red-600 border-red-500 text-white"
                                          : "bg-white border-slate-300 hover:bg-slate-100 text-red-600"
                                      }`}
                                    >
                                      Exclude row
                                    </button>
                                  )}
                                </div>
                              )}

                              {/* Invalid Percentage Split Suggested Fixes */}
                              {a.anomalyType === "INVALID_PERCENT_SPLIT" && (
                                <div className="space-y-4 w-full">
                                  {/* Quick Actions */}
                                  <div className="flex flex-wrap gap-2">
                                    <button
                                      onClick={() => {
                                        const details = (a.normalizedRow.splitDetails || {}) as Record<string, number>;
                                        const sum = Object.values(details).reduce((x: number, y: number) => x + y, 0);
                                        const keys = Object.keys(details);
                                        const newDetails: Record<string, number> = {};
                                        if (sum === 0) {
                                          const eq = parseFloat((100 / keys.length).toFixed(2));
                                          let s = 0;
                                          keys.forEach((k, idx) => {
                                            if (idx === keys.length - 1) newDetails[k] = parseFloat((100 - s).toFixed(2));
                                            else { newDetails[k] = eq; s += eq; }
                                          });
                                        } else {
                                          let s = 0;
                                          keys.forEach((k, idx) => {
                                            if (idx === keys.length - 1) newDetails[k] = parseFloat((100 - s).toFixed(2));
                                            else {
                                              const val = parseFloat(((details[k] / sum) * 100).toFixed(2));
                                              newDetails[k] = val;
                                              s += val;
                                            }
                                          });
                                        }
                                        handleResolveAnomaly(a.fingerprint, "CORRECTED_PERCENT_SPLIT", { correctedSplitDetails: newDetails, resolutionMethod: "proportional" });
                                      }}
                                      className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold cursor-pointer transition-all ${
                                        resolution?.resolutionAction === "CORRECTED_PERCENT_SPLIT" && resolution?.resolutionDetails?.resolutionMethod === "proportional"
                                          ? "bg-blue-600 border-blue-500 text-white"
                                          : "bg-white border-slate-300 hover:bg-slate-50 text-slate-700"
                                      }`}
                                    >
                                      Proportional Auto-normalize
                                    </button>

                                    <button
                                      onClick={() => {
                                        const details = (a.normalizedRow.splitDetails || {}) as Record<string, number>;
                                        const sum = Object.values(details).reduce((x: number, y: number) => x + y, 0);
                                        const keys = Object.keys(details);
                                        const diff = 100 - sum;
                                        const share = diff / keys.length;
                                        const newDetails: Record<string, number> = {};
                                        let s = 0;
                                        keys.forEach((k, idx) => {
                                          if (idx === keys.length - 1) newDetails[k] = parseFloat((100 - s).toFixed(2));
                                          else {
                                            const val = parseFloat((details[k] + share).toFixed(2));
                                            newDetails[k] = val;
                                            s += val;
                                          }
                                        });
                                        handleResolveAnomaly(a.fingerprint, "CORRECTED_PERCENT_SPLIT", { correctedSplitDetails: newDetails, resolutionMethod: "distribute" });
                                      }}
                                      className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold cursor-pointer transition-all ${
                                        resolution?.resolutionAction === "CORRECTED_PERCENT_SPLIT" && resolution?.resolutionDetails?.resolutionMethod === "distribute"
                                          ? "bg-blue-600 border-blue-500 text-white"
                                          : "bg-white border-slate-300 hover:bg-slate-50 text-slate-700"
                                      }`}
                                    >
                                      Distribute Remainder
                                    </button>

                                    <button
                                      onClick={() => {
                                        const details = (a.normalizedRow.splitDetails || {}) as Record<string, number>;
                                        const keys = Object.keys(details);
                                        const eq = parseFloat((100 / keys.length).toFixed(2));
                                        const newDetails: Record<string, number> = {};
                                        let s = 0;
                                        keys.forEach((k, idx) => {
                                          if (idx === keys.length - 1) newDetails[k] = parseFloat((100 - s).toFixed(2));
                                          else { newDetails[k] = eq; s += eq; }
                                        });
                                        handleResolveAnomaly(a.fingerprint, "CORRECTED_PERCENT_SPLIT", { correctedSplitDetails: newDetails, resolutionMethod: "equal" });
                                      }}
                                      className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold cursor-pointer transition-all ${
                                        resolution?.resolutionAction === "CORRECTED_PERCENT_SPLIT" && resolution?.resolutionDetails?.resolutionMethod === "equal"
                                          ? "bg-blue-600 border-blue-500 text-white"
                                          : "bg-white border-slate-300 hover:bg-slate-50 text-slate-700"
                                      }`}
                                    >
                                      Split Equally
                                    </button>
                                  </div>

                                  {/* Manual editor */}
                                  <div className="border border-slate-200 rounded-lg p-3 bg-white space-y-2.5">
                                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Manual Adjustment (Target: 100%)</div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                      {Object.keys(a.normalizedRow.splitDetails || {}).map(member => {
                                        const details = (resolution?.resolutionDetails?.correctedSplitDetails || a.normalizedRow.splitDetails || {}) as Record<string, number>;
                                        const val = details[member] !== undefined ? details[member] : 0;
                                        return (
                                          <div key={member} className="flex items-center justify-between border border-slate-100 rounded p-1.5 text-[11px]">
                                            <span className="font-semibold text-slate-700">{member}</span>
                                            <div className="flex items-center space-x-1">
                                              <input
                                                type="number"
                                                step="0.01"
                                                value={val}
                                                onChange={(e) => {
                                                  const newDetails = {
                                                    ...((resolution?.resolutionDetails?.correctedSplitDetails || a.normalizedRow.splitDetails || {}) as Record<string, number>),
                                                    [member]: parseFloat(e.target.value) || 0
                                                  };
                                                  handleResolveAnomaly(a.fingerprint, "CORRECTED_PERCENT_SPLIT", { correctedSplitDetails: newDetails, resolutionMethod: "manual" });
                                                }}
                                                className="w-16 border border-slate-200 rounded px-1.5 py-0.5 text-right font-semibold text-slate-800"
                                              />
                                              <span className="text-slate-400 font-bold">%</span>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                    {(() => {
                                      const details = (resolution?.resolutionDetails?.correctedSplitDetails || a.normalizedRow.splitDetails || {}) as Record<string, number>;
                                      const sum = Object.values(details).reduce((x: number, y: number) => x + y, 0);
                                      const isCorrect = Math.abs(sum - 100) < 0.01;
                                      return (
                                        <div className="flex items-center justify-between pt-1 text-xs border-t border-slate-100">
                                          <span className="font-semibold text-slate-500">Total Sum:</span>
                                          <span className={`font-extrabold ${isCorrect ? "text-green-600" : "text-red-600"}`}>
                                            {sum.toFixed(2)}% {isCorrect ? "✓ (Valid)" : `✗ (Must be 100%)`}
                                          </span>
                                        </div>
                                      );
                                    })()}
                                  </div>
                                </div>
                              )}

                              {/* Invalid Exact Split Suggested Fixes */}
                              {a.anomalyType === "INVALID_EXACT_SPLIT" && (
                                <div className="space-y-4 w-full">
                                  {/* Quick Actions */}
                                  <div className="flex flex-wrap gap-2">
                                    <button
                                      onClick={() => {
                                        const details = (a.normalizedRow.splitDetails || {}) as Record<string, number>;
                                        const sum = Object.values(details).reduce((x: number, y: number) => x + y, 0);
                                        const total = a.normalizedRow.originalAmount || 0;
                                        const keys = Object.keys(details);
                                        const newDetails: Record<string, number> = {};
                                        if (sum === 0) {
                                          const eq = parseFloat((total / keys.length).toFixed(2));
                                          let s = 0;
                                          keys.forEach((k, idx) => {
                                            if (idx === keys.length - 1) newDetails[k] = parseFloat((total - s).toFixed(2));
                                            else { newDetails[k] = eq; s += eq; }
                                          });
                                        } else {
                                          let s = 0;
                                          keys.forEach((k, idx) => {
                                            if (idx === keys.length - 1) newDetails[k] = parseFloat((total - s).toFixed(2));
                                            else {
                                              const val = parseFloat(((details[k] / sum) * total).toFixed(2));
                                              newDetails[k] = val;
                                              s += val;
                                            }
                                          });
                                        }
                                        handleResolveAnomaly(a.fingerprint, "CORRECTED_PERCENT_SPLIT", { correctedSplitDetails: newDetails, resolutionMethod: "proportional" });
                                      }}
                                      className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold cursor-pointer transition-all ${
                                        resolution?.resolutionAction === "CORRECTED_PERCENT_SPLIT" && resolution?.resolutionDetails?.resolutionMethod === "proportional"
                                          ? "bg-blue-600 border-blue-500 text-white"
                                          : "bg-white border-slate-300 hover:bg-slate-55 text-slate-700"
                                      }`}
                                    >
                                      Proportional Auto-normalize
                                    </button>

                                    <button
                                      onClick={() => {
                                        const details = (a.normalizedRow.splitDetails || {}) as Record<string, number>;
                                        const sum = Object.values(details).reduce((x: number, y: number) => x + y, 0);
                                        const total = a.normalizedRow.originalAmount || 0;
                                        const keys = Object.keys(details);
                                        const diff = total - sum;
                                        const share = diff / keys.length;
                                        const newDetails: Record<string, number> = {};
                                        let s = 0;
                                        keys.forEach((k, idx) => {
                                          if (idx === keys.length - 1) newDetails[k] = parseFloat((total - s).toFixed(2));
                                          else {
                                            const val = parseFloat((details[k] + share).toFixed(2));
                                            newDetails[k] = val;
                                            s += val;
                                          }
                                        });
                                        handleResolveAnomaly(a.fingerprint, "CORRECTED_PERCENT_SPLIT", { correctedSplitDetails: newDetails, resolutionMethod: "distribute" });
                                      }}
                                      className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold cursor-pointer transition-all ${
                                        resolution?.resolutionAction === "CORRECTED_PERCENT_SPLIT" && resolution?.resolutionDetails?.resolutionMethod === "distribute"
                                          ? "bg-blue-600 border-blue-500 text-white"
                                          : "bg-white border-slate-300 hover:bg-slate-55 text-slate-700"
                                      }`}
                                    >
                                      Distribute Remainder
                                    </button>

                                    <button
                                      onClick={() => {
                                        const details = (a.normalizedRow.splitDetails || {}) as Record<string, number>;
                                        const total = a.normalizedRow.originalAmount || 0;
                                        const keys = Object.keys(details);
                                        const eq = parseFloat((total / keys.length).toFixed(2));
                                        const newDetails: Record<string, number> = {};
                                        let s = 0;
                                        keys.forEach((k, idx) => {
                                          if (idx === keys.length - 1) newDetails[k] = parseFloat((total - s).toFixed(2));
                                          else { newDetails[k] = eq; s += eq; }
                                        });
                                        handleResolveAnomaly(a.fingerprint, "CORRECTED_PERCENT_SPLIT", { correctedSplitDetails: newDetails, resolutionMethod: "equal" });
                                      }}
                                      className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold cursor-pointer transition-all ${
                                        resolution?.resolutionAction === "CORRECTED_PERCENT_SPLIT" && resolution?.resolutionDetails?.resolutionMethod === "equal"
                                          ? "bg-blue-600 border-blue-500 text-white"
                                          : "bg-white border-slate-300 hover:bg-slate-55 text-slate-700"
                                      }`}
                                    >
                                      Split Equally
                                    </button>
                                  </div>

                                  {/* Manual editor */}
                                  <div className="border border-slate-200 rounded-lg p-3 bg-white space-y-2.5">
                                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Manual Adjustment (Target: ₹{a.normalizedRow.originalAmount})</div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                      {Object.keys(a.normalizedRow.splitDetails || {}).map(member => {
                                        const details = (resolution?.resolutionDetails?.correctedSplitDetails || a.normalizedRow.splitDetails || {}) as Record<string, number>;
                                        const val = details[member] !== undefined ? details[member] : 0;
                                        return (
                                          <div key={member} className="flex items-center justify-between border border-slate-100 rounded p-1.5 text-[11px]">
                                            <span className="font-semibold text-slate-700">{member}</span>
                                            <div className="flex items-center space-x-1">
                                              <span className="text-slate-400 font-bold">₹</span>
                                              <input
                                                type="number"
                                                step="0.01"
                                                value={val}
                                                onChange={(e) => {
                                                  const newDetails = {
                                                    ...((resolution?.resolutionDetails?.correctedSplitDetails || a.normalizedRow.splitDetails || {}) as Record<string, number>),
                                                    [member]: parseFloat(e.target.value) || 0
                                                  };
                                                  handleResolveAnomaly(a.fingerprint, "CORRECTED_PERCENT_SPLIT", { correctedSplitDetails: newDetails, resolutionMethod: "manual" });
                                                }}
                                                className="w-16 border border-slate-200 rounded px-1.5 py-0.5 text-right font-semibold text-slate-800"
                                              />
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                    {(() => {
                                      const details = (resolution?.resolutionDetails?.correctedSplitDetails || a.normalizedRow.splitDetails || {}) as Record<string, number>;
                                      const sum = Object.values(details).reduce((x: number, y: number) => x + y, 0);
                                      const total = a.normalizedRow.originalAmount || 0;
                                      const isCorrect = Math.abs(sum - total) < 0.01;
                                      return (
                                        <div className="flex items-center justify-between pt-1 text-xs border-t border-slate-100">
                                          <span className="font-semibold text-slate-500">Total Sum:</span>
                                          <span className={`font-extrabold ${isCorrect ? "text-green-600" : "text-red-600"}`}>
                                            ₹{sum.toFixed(2)} {isCorrect ? "✓ (Valid)" : `✗ (Must be ₹${total})`}
                                          </span>
                                        </div>
                                      );
                                    })()}
                                  </div>
                                </div>
                              )}

                              {/* Manual Exclude Button for other types */}
                              {!["DUPLICATE", "MEMBERSHIP_VIOLATION"].includes(a.anomalyType) && (
                                <button
                                  onClick={() => handleResolveAnomaly(a.fingerprint, "REJECT_ROW")}
                                  className={`px-3 py-1.5 rounded-lg border font-semibold cursor-pointer transition-all ${
                                    resolution?.resolutionAction === "REJECT_ROW"
                                      ? "bg-red-600 border-red-500 text-white"
                                      : "bg-white border-slate-300 hover:bg-red-50 hover:text-red-600 text-slate-500 ml-auto"
                                  }`}
                                >
                                  Exclude row
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Notes */}
                          <div className="mt-3">
                            <input 
                              type="text" 
                              value={resolution?.resolutionNote || ""}
                              onChange={e => handleResolveNote(a.fingerprint, e.target.value)}
                              placeholder="Audit trail note: explain why you resolved it this way..."
                              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-[11px] font-medium focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 text-slate-700"
                            />
                          </div>

                        </div>
                      );
                    });
                  })()}
                </div>

                {/* Right Column: Diagnostics panel and Final controls */}
                <div className="space-y-6">
                  {/* Final control */}
                  <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
                    <h3 className="font-semibold text-sm text-slate-800">Reconciliation controls</h3>
                    <div className="text-xs text-slate-550 space-y-2 font-medium">
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
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg cursor-pointer text-xs transition-colors shadow-sm"
                    >
                      Commit adjustments & finalize
                    </button>
                  </div>

                  {/* Diagnostics Panel (Human Readable Format) */}
                  <div className="bg-slate-900 text-slate-300 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4 font-mono text-[10px] leading-relaxed">
                    <h4 className="font-semibold border-b border-slate-800 pb-2 text-slate-400 flex items-center">
                      <Database className="w-3.5 h-3.5 mr-1.5" strokeWidth={1.5} /> Pipeline diagnostics
                    </h4>
                    <div className="space-y-3.5 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
                      {diagnosticsLogs.length === 0 ? (
                        <p className="text-slate-500">Awaiting import pipeline start...</p>
                      ) : (
                        diagnosticsLogs.map((log, idx) => {
                          const keys = Object.keys(log.details || {});
                          return (
                            <div key={idx} className="space-y-1 border-b border-slate-800/80 pb-2.5 last:border-0 last:pb-0">
                              <div className="flex items-center justify-between text-blue-400 font-bold">
                                <span>[{log.timestamp}] STAGE: {log.stage}</span>
                              </div>
                              <div className="text-slate-400 pl-2 space-y-0.5 font-medium">
                                {keys.map(k => {
                                  const val = log.details[k];
                                  const displayVal = typeof val === "object" && val !== null
                                    ? Array.isArray(val) ? `[${val.length} items]` : "{details}"
                                    : String(val);
                                  return (
                                    <div key={k}>
                                      • {k}: <span className="text-slate-200">{displayVal}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })
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
                className="text-slate-500 hover:text-slate-800 flex items-center text-xs font-semibold transition-colors cursor-pointer"
              >
                <ArrowRight className="w-4 h-4 mr-1 rotate-180" /> Back to dashboard
              </button>
              <h2 className="text-sm font-semibold text-slate-905 flex items-center">
                <ShieldAlert className="w-5 h-5 mr-2 text-blue-600" /> Admin walkthrough diagnostics
              </h2>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Left Side: Audit Log Feed */}
              <div className="lg:col-span-2 space-y-6">
                
                {/* Audit Logs */}
                <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                  <h3 className="font-semibold text-sm text-slate-800 mb-4 flex items-center">
                    <History className="w-4 h-4 mr-2 text-slate-400" /> Audit resolution logs
                  </h3>

                  <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1 custom-scrollbar">
                    {adminDemoData.auditLogs.length === 0 ? (
                      <p className="text-xs text-slate-400 py-4 text-center font-medium">No audit logs written.</p>
                    ) : (
                      adminDemoData.auditLogs.map(log => (
                        <div key={log.id} className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-2 font-medium">
                          <div className="flex justify-between text-[10px] text-slate-450 font-bold border-b border-slate-100 pb-1.5">
                            <span>Action: <b>{log.action.toLowerCase().replace(/_/g, ' ')}</b></span>
                            <span>{new Date(log.createdAt).toLocaleString("en-IN")}</span>
                          </div>
                          <p className="text-slate-800">
                            Entity: <span className="font-bold">{log.entityType}</span> ({log.entityId})
                          </p>
                          {log.afterState && typeof log.afterState === "object" && (
                            <div className="mt-3 bg-white border border-slate-150 rounded-lg p-3 space-y-1.5 shadow-sm text-[10px] font-medium text-slate-600">
                              {Object.entries(log.afterState).map(([key, val]) => {
                                const displayVal = typeof val === "object" && val !== null
                                  ? Array.isArray(val) ? `[${val.length} items]` : "{details}"
                                  : String(val);
                                return (
                                  <div key={key} className="flex justify-between border-b border-slate-50 last:border-0 pb-1 last:pb-0">
                                    <span className="text-slate-400">{key.replace(/([A-Z])/g, ' $1').toLowerCase()}</span>
                                    <span className="text-slate-850 font-semibold truncate max-w-[220px]" title={displayVal}>{displayVal}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Import Job Diagnostics details */}
                <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                  <h3 className="font-semibold text-sm text-slate-800 mb-4 flex items-center">
                    <FileText className="w-4 h-4 mr-2 text-slate-400" /> Import anomaly files details
                  </h3>
                  <div className="space-y-4">
                    {adminDemoData.importJobs.map(job => (
                      <div key={job.id} className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 text-xs font-medium">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                          <h4 className="font-bold text-slate-800 text-[13px]">{job.rawFileName}</h4>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                            job.status === "COMPLETED" ? "bg-green-50 border-green-200 text-green-700" : "bg-blue-50 border-blue-200 text-blue-700"
                          }`}>{job.status.toLowerCase()}</span>
                        </div>
                        <p className="text-[10px] text-slate-450">File hash: <span className="font-mono">{job.rawFileHash}</span></p>
                        {job.anomalies && job.anomalies.length > 0 && (
                          <div className="space-y-2 pl-3 border-l-2 border-slate-200 pt-1">
                            <p className="font-bold text-slate-400 text-[9px] uppercase tracking-wider mb-1.5">Anomalies resolved</p>
                            {job.anomalies.map(a => (
                              <div key={a.id} className="text-[11px] text-slate-705 leading-relaxed">
                                Row {a.rowNumber} ({a.anomalyType.toLowerCase().replace(/_/g, ' ')}): {a.description} 
                                {a.resolutionAction && <b className="text-green-600"> $\rightarrow$ Resolved: {a.resolutionAction.toLowerCase().replace(/_/g, ' ')}</b>}
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
                <h3 className="font-semibold text-sm text-slate-800 mb-4 flex items-center">
                  <Calendar className="w-4 h-4 mr-2 text-slate-400" /> Membership active periods
                </h3>
                <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1 custom-scrollbar">
                  {adminDemoData.memberships.map(m => (
                    <div key={m.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1 font-medium">
                      <div className="flex justify-between font-bold text-slate-800">
                        <span>{m.user.name}</span>
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold border ${
                          m.leftAt ? "bg-red-50 border-red-200 text-red-700" : "bg-green-50 border-green-200 text-green-700"
                        }`}>
                          {m.leftAt ? "Inactive" : "Active"}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500">Group: {m.group.name}</p>
                      <p className="text-[10px] text-slate-400">Joined: {new Date(m.joinedAt).toLocaleDateString("en-IN")}</p>
                      {m.leftAt && <p className="text-[10px] text-rose-600 font-semibold">Left: {new Date(m.leftAt).toLocaleDateString("en-IN")}</p>}
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
                        net > 0 ? "text-green-600" : net < 0 ? "text-red-600" : "text-slate-500"
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
                traceUser.netBalance > 0 ? "text-green-600" : traceUser.netBalance < 0 ? "text-red-600" : "text-slate-700"
              }`}>
                {traceUser.netBalance > 0 ? "+" : ""}{traceUser.netBalance.toLocaleString("en-IN", { style: "currency", currency: "INR" })}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Past spreadsheet import detail report */}
      {selectedImportJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full p-6 shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-4">
              <div>
                <h3 className="font-bold text-base text-slate-900">Import Reconciliation Report</h3>
                <p className="text-[10px] text-slate-500">Job: {selectedImportJob.id}</p>
              </div>
              <button 
                onClick={() => setSelectedImportJob(null)}
                className="text-xs font-semibold px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg cursor-pointer transition-colors"
              >
                Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
                <div className="grid grid-cols-2 gap-2 text-slate-650">
                  <div>File name: <b className="text-slate-800">{selectedImportJob.rawFileName}</b></div>
                  <div>Status: <b className="text-slate-800">{selectedImportJob.status}</b></div>
                  <div>Imported: <b className="text-slate-800">{new Date(selectedImportJob.uploadedAt).toLocaleString()}</b></div>
                  <div>Hash: <b className="text-slate-450 font-mono text-[10px]">{selectedImportJob.rawFileHash.substring(0, 16)}...</b></div>
                </div>

                {selectedImportJob.summary && (
                  <div className="grid grid-cols-3 gap-2 border-t border-slate-200 pt-2 mt-2 text-center text-slate-650">
                    <div>
                      <p className="text-[9px] text-slate-450 uppercase font-bold">Rows</p>
                      <p className="font-extrabold text-slate-700">{selectedImportJob.summary.rowsProcessed}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-slate-450 uppercase font-bold">Expenses</p>
                      <p className="font-extrabold text-green-600">+{selectedImportJob.summary.expensesCreated}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-slate-450 uppercase font-bold">Settlements</p>
                      <p className="font-extrabold text-blue-700">+{selectedImportJob.summary.settlementsCreated}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Anomalies Audits */}
              <div className="space-y-3">
                <h4 className="font-bold text-xs text-slate-700 uppercase tracking-wider">resolved anomalies log ({selectedImportJob.anomalies?.length || 0})</h4>
                {selectedImportJob.anomalies && selectedImportJob.anomalies.length > 0 ? (
                  <div className="space-y-2">
                    {selectedImportJob.anomalies.map((a: any) => (
                      <div key={a.id} className="p-3 bg-white border border-slate-200 rounded-xl text-xs space-y-2">
                        <div className="flex justify-between items-center text-[10px]">
                          <span className="font-bold text-slate-400">Row {a.rowNumber} • {a.anomalyType}</span>
                          <span className="px-2 py-0.5 rounded font-bold bg-green-50 text-green-700 border border-green-200">
                            {a.status}
                          </span>
                        </div>
                        <p className="font-semibold text-slate-800">{a.description}</p>
                        
                        {a.resolutionAction && (
                          <div className="p-2 bg-slate-50 border border-slate-100 rounded-lg space-y-1 text-[11px]">
                            <div>Action: <b className="text-blue-700 font-semibold">{a.resolutionAction}</b></div>
                            {a.resolutionNote && <div>Note: <span className="text-slate-600">{a.resolutionNote}</span></div>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-450 italic">No anomalies were detected during import.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
