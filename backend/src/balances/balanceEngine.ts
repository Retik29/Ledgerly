import { Decimal } from "@prisma/client/runtime/library";

export interface ExpenseShare {
  id: string;
  title: string;
  date: Date;
  type: "EXPENSE";
  amount: number;         // Total expense amount in INR
  currency: string;       // Original currency
  originalAmount: number; // Original amount
  paidAmount: number;     // What the user paid (0 if not payer)
  owedAmount: number;     // What the user owed (0 if not participant)
  netEffect: number;      // paidAmount - owedAmount
}

export interface SettlementShare {
  id: string;
  payerName: string;
  receiverName: string;
  date: Date;
  type: "SETTLEMENT";
  amount: number;         // Settlement amount in INR
  currency: string;
  paidAmount: number;     // What the user paid (0 if not payer)
  receivedAmount: number; // What the user received (0 if not receiver)
  netEffect: number;      // paidAmount - receivedAmount
}

export type TraceItem = ExpenseShare | SettlementShare;

export interface UserBalanceSummary {
  userId: string;
  userName: string;
  totalPaidExpenses: number;
  totalOwedExpenses: number;
  totalPaidSettlements: number;
  totalReceivedSettlements: number;
  netBalance: number;
  trace: TraceItem[];
}

export interface SimplifiedDebt {
  fromUser: string;
  toUser: string;
  amount: number;
}

export class BalanceEngine {
  /**
   * Computes the net balance and detailed traceability log for all users in a group.
   */
  static computeBalances(
    users: { id: string; name: string }[],
    expenses: {
      id: string;
      title: string;
      expenseDate: Date;
      normalizedAmount: Decimal | number;
      amount: Decimal | number;
      currency: string;
      paidBy: string;
      participants: { userId: string; shareAmount: Decimal | number }[];
    }[],
    settlements: {
      id: string;
      payerId: string;
      receiverId: string;
      amount: Decimal | number;
      currency: string;
      settlementDate: Date;
    }[]
  ): UserBalanceSummary[] {
    const summaries: { [userId: string]: UserBalanceSummary } = {};

    // Initialize summaries
    for (const u of users) {
      summaries[u.id] = {
        userId: u.id,
        userName: u.name,
        totalPaidExpenses: 0,
        totalOwedExpenses: 0,
        totalPaidSettlements: 0,
        totalReceivedSettlements: 0,
        netBalance: 0,
        trace: []
      };
    }

    // Helper: convert Decimal to number
    const toNumber = (val: Decimal | number): number => {
      if (typeof val === "number") return val;
      return val.toNumber();
    };

    // Process expenses
    for (const exp of expenses) {
      const totalInr = toNumber(exp.normalizedAmount);
      const originalAmt = toNumber(exp.amount);
      const payerId = exp.paidBy;

      const participantMap = new Map<string, number>();
      for (const p of exp.participants) {
        participantMap.set(p.userId, toNumber(p.shareAmount));
      }

      // We want to loop over all users to populate the trace properly
      for (const u of users) {
        const isPayer = u.id === payerId;
        const owed = participantMap.get(u.id) || 0;
        const paid = isPayer ? totalInr : 0;

        if (paid > 0 || owed > 0) {
          const sum = summaries[u.id];
          if (sum) {
            sum.totalPaidExpenses += paid;
            sum.totalOwedExpenses += owed;
            sum.trace.push({
              id: exp.id,
              title: exp.title,
              date: exp.expenseDate,
              type: "EXPENSE",
              amount: totalInr,
              currency: exp.currency,
              originalAmount: originalAmt,
              paidAmount: paid,
              owedAmount: owed,
              netEffect: parseFloat((paid - owed).toFixed(2))
            });
          }
        }
      }
    }

    // Process settlements
    for (const set of settlements) {
      const amt = toNumber(set.amount);
      const payerId = set.payerId;
      const receiverId = set.receiverId;

      const payerName = users.find(u => u.id === payerId)?.name || "Unknown";
      const receiverName = users.find(u => u.id === receiverId)?.name || "Unknown";

      for (const u of users) {
        const isPayer = u.id === payerId;
        const isReceiver = u.id === receiverId;
        const paid = isPayer ? amt : 0;
        const received = isReceiver ? amt : 0;

        if (paid > 0 || received > 0) {
          const sum = summaries[u.id];
          if (sum) {
            sum.totalPaidSettlements += paid;
            sum.totalReceivedSettlements += received;
            sum.trace.push({
              id: set.id,
              payerName,
              receiverName,
              date: set.settlementDate,
              type: "SETTLEMENT",
              amount: amt,
              currency: set.currency,
              paidAmount: paid,
              receivedAmount: received,
              netEffect: parseFloat((paid - received).toFixed(2))
            });
          }
        }
      }
    }

    // Finalize net balances and sort traces chronologically
    const resultList: UserBalanceSummary[] = [];
    for (const u of users) {
      const sum = summaries[u.id];
      if (sum) {
        const rawBalance = (sum.totalPaidExpenses + sum.totalPaidSettlements) - 
                           (sum.totalOwedExpenses + sum.totalReceivedSettlements);
        sum.netBalance = parseFloat(rawBalance.toFixed(2));
        sum.trace.sort((a, b) => a.date.getTime() - b.date.getTime());
        resultList.push(sum);
      }
    }

    return resultList;
  }

  /**
   * Cash Flow Minimization Algorithm (Debt Simplification).
   * Simplifies debts between members to minimize the total number of transactions.
   */
  static simplifyDebts(summaries: UserBalanceSummary[]): SimplifiedDebt[] {
    // Clone and map to working balances
    const balances = summaries.map(s => ({
      userName: s.userName,
      amount: s.netBalance
    }));

    const debtors = balances.filter(b => b.amount < -0.01).sort((a, b) => a.amount - b.amount); // descending debt (most negative first)
    const creditors = balances.filter(b => b.amount > 0.01).sort((a, b) => b.amount - a.amount); // descending credit (most positive first)

    const simplified: SimplifiedDebt[] = [];

    let dIdx = 0;
    let cIdx = 0;

    while (dIdx < debtors.length && cIdx < creditors.length) {
      const debtor = debtors[dIdx];
      const creditor = creditors[cIdx];

      const debtAmount = Math.abs(debtor.amount);
      const creditAmount = creditor.amount;

      const settledAmount = parseFloat(Math.min(debtAmount, creditAmount).toFixed(2));

      if (settledAmount > 0) {
        simplified.push({
          fromUser: debtor.userName,
          toUser: creditor.userName,
          amount: settledAmount
        });
      }

      debtor.amount += settledAmount;
      creditor.amount -= settledAmount;

      if (Math.abs(debtor.amount) < 0.01) {
        dIdx++;
      }
      if (Math.abs(creditor.amount) < 0.01) {
        cIdx++;
      }
    }

    return simplified;
  }
}
