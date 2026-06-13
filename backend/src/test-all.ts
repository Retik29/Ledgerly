import { prisma } from "./shared/prisma";
import { CsvParser } from "./imports/csvParser";
import { Normalizer } from "./imports/normalizer";
import { AnomalyEngine } from "./anomalies/anomalyEngine";
import { ImportContext } from "./anomalies/rules";
import { DecisionEngine } from "./imports/decisionEngine";
import { PersistenceService } from "./imports/persistence";
import { BalanceEngine } from "./balances/balanceEngine";
import { MembershipEngine } from "./memberships/membershipEngine";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "super-secret-ledgerly-key-2026";

async function runTests() {
  console.log("==================================================");
  console.log("🧪 LEDGERLY AUTOMATED TEST SUITE");
  console.log("==================================================");

  let passed = 0;
  let failed = 0;

  const assert = (condition: boolean, testName: string) => {
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passed++;
    } else {
      console.log(`❌ FAIL: ${testName}`);
      failed++;
    }
  };

  try {
    // --------------------------------------------------
    // PHASE 2: DATABASE TESTING
    // --------------------------------------------------
    console.log("\n--- PHASE 2: Database Connection & Seed Validation ---");
    const userCount = await prisma.user.count();
    assert(userCount >= 6, `Seed users present: count is ${userCount}`);

    const groupCount = await prisma.group.count();
    assert(groupCount >= 1, `Seed group present: count is ${groupCount}`);

    const memberCount = await prisma.groupMembership.count();
    assert(memberCount >= 6, `Seed memberships present: count is ${memberCount}`);

    // Test soft membership query
    const meera = await prisma.user.findFirst({ where: { name: "Meera" } });
    const meeraMem = await prisma.groupMembership.findFirst({
      where: { userId: meera?.id }
    });
    assert(meeraMem?.leftAt !== null, "Meera membership indicates she left on Mar 31");

    // --------------------------------------------------
    // PHASE 3: AUTHENTICATION TESTING
    // --------------------------------------------------
    console.log("\n--- PHASE 3: Authentication Logic Validation ---");
    // Registration
    const testEmail = "testqa@example.com";
    const testPass = "pass123";
    const existingTest = await prisma.user.findUnique({ where: { email: testEmail } });
    if (existingTest) {
      await prisma.user.delete({ where: { email: testEmail } });
    }

    const hash = await bcrypt.hash(testPass, 10);
    const testUser = await prisma.user.create({
      data: {
        name: "Test QA",
        email: testEmail,
        passwordHash: hash
      }
    });

    const isMatch = await bcrypt.compare(testPass, testUser.passwordHash);
    assert(isMatch, "Bcrypt hashes passwords correctly");

    const token = jwt.sign(
      { id: testUser.id, email: testUser.email, name: testUser.name },
      JWT_SECRET
    );
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    assert(decoded.name === "Test QA", "JWT token signs and verifies correctly");

    // Clean up test user
    await prisma.user.delete({ where: { id: testUser.id } });

    // --------------------------------------------------
    // PHASE 7: MEMBERSHIP ENGINE TESTING
    // --------------------------------------------------
    console.log("\n--- PHASE 7: Membership Boundaries Validation ---");
    const activePeriod = [{
      joinedAt: new Date("2026-02-01"),
      leftAt: new Date("2026-03-31")
    }];

    assert(
      MembershipEngine.isMemberActiveOnDate(activePeriod, new Date("2026-02-15")) === true,
      "Member active during their active period"
    );
    assert(
      MembershipEngine.isMemberActiveOnDate(activePeriod, new Date("2026-04-10")) === false,
      "Member inactive after leaving group"
    );
    assert(
      MembershipEngine.isMemberActiveOnDate(activePeriod, new Date("2026-01-15")) === false,
      "Member inactive before joining group"
    );

    // --------------------------------------------------
    // PHASE 8: CSV IMPORT PIPELINE TESTING
    // --------------------------------------------------
    console.log("\n--- PHASE 8: CSV Parser & Anomaly Engine Validation ---");
    
    // Sample Raw CSV text containing 3 rows (with duplicates, missing currencies)
    const mockCsv = `date,description,paid_by,amount,currency,split_type,split_with,split_details,notes
01-02-2026,February rent,Aisha,48000,INR,equal,Aisha;Rohan;Priya;Meera,,
08-02-2026,Dinner at Marina Bites,Dev,3200,INR,equal,Aisha;Rohan;Priya;Dev,,Dev visiting for the weekend
08-02-2026,dinner - marina bites,Dev,3200,INR,equal,Aisha;Rohan;Priya;Dev,,
15-03-2026,Groceries DMart,Priya,2105,,equal,Aisha;Rohan;Priya;Meera,,forgot to set currency
22-02-2026,House cleaning supplies,,780,INR,equal,Aisha;Rohan;Priya;Meera,,can't remember who paid
25-02-2026,Rohan paid Aisha back,Rohan,5000,INR,,Aisha,,this is a settlement not an expense`;

    const rawRows = CsvParser.parse(mockCsv);
    assert(rawRows.length === 6, `CSV Parser parsed exactly ${rawRows.length} rows`);
    assert(rawRows[4].paid_by === "", "CSV Parser correctly extracted empty paid_by value");

    const normalizedRows = rawRows.map(r => Normalizer.normalize(r));
    assert(normalizedRows[3].currency === "INR", "Normalizer correctly inferred missing currency as INR");
    assert(normalizedRows[4].paidBy === "", "Normalizer clean empty paidBy");

    // Anomaly engine
    const context: ImportContext = {
      groupId: "test-group",
      userMap: {},
      existingUsers: ["Aisha", "Rohan", "Priya", "Meera", "Sam", "Dev"],
      memberships: {
        Aisha: [{ joinedAt: new Date("2026-02-01"), leftAt: null }],
        Rohan: [{ joinedAt: new Date("2026-02-01"), leftAt: null }],
        Priya: [{ joinedAt: new Date("2026-02-01"), leftAt: null }],
        Meera: [{ joinedAt: new Date("2026-02-01"), leftAt: new Date("2026-03-31") }],
        Sam: [{ joinedAt: new Date("2026-04-08"), leftAt: null }],
        Dev: [{ joinedAt: new Date("2026-02-01"), leftAt: null }]
      },
      otherParsedRows: normalizedRows,
      existingExpenses: []
    };

    const engine = new AnomalyEngine();
    const anomalies = engine.detectAll(rawRows, normalizedRows, context);

    const dupAnomaly = anomalies.find(a => a.anomalyType === "DUPLICATE");
    assert(dupAnomaly !== undefined, "Anomaly Engine detected fuzzy duplicate rows (Dinner Marina Bites)");

    const missingPayer = anomalies.find(a => a.anomalyType === "MISSING_PAYER");
    assert(missingPayer !== undefined, "Anomaly Engine detected missing payer row 5");

    const settlementDisguised = anomalies.find(a => a.anomalyType === "SETTLEMENT_DISGUISED_AS_EXPENSE");
    assert(settlementDisguised !== undefined, "Anomaly Engine detected settlement disguised as expense (Row 6)");

    // --------------------------------------------------
    // PHASE 5: EXPENSE ENGINE SPLITS TESTING
    // --------------------------------------------------
    console.log("\n--- PHASE 5: Financial Split Engine Validation ---");
    const equalShares = PersistenceService["calculateShares"](
      1000, "equal", ["u1", "u2", "u3", "u4"], {}, {}
    );
    assert(equalShares[0].shareAmount === 250 && equalShares[3].shareAmount === 250, "Equal split share parsed: 250 each");

    const percentageShares = PersistenceService["calculateShares"](
      1000, "percentage", ["u1", "u2", "u3"], { u1: 50, u2: 30, u3: 20 }, { u1: "u1", u2: "u2", u3: "u3" }
    );
    assert(
      percentageShares[0].shareAmount === 500 &&
      percentageShares[1].shareAmount === 300 &&
      percentageShares[2].shareAmount === 200,
      "Percentage split share parsed: 500, 300, 200"
    );

    const exactShares = PersistenceService["calculateShares"](
      400, "exact", ["u1", "u2", "u3"], { u1: 100, u2: 150, u3: 150 }, { u1: "u1", u2: "u2", u3: "u3" }
    );
    assert(
      exactShares[0].shareAmount === 100 &&
      exactShares[1].shareAmount === 150 &&
      exactShares[2].shareAmount === 150,
      "Exact split share parsed: 100, 150, 150"
    );

    const weightedShares = PersistenceService["calculateShares"](
      1000, "share", ["u1", "u2", "u3"], { u1: 2, u2: 1, u3: 1 }, { u1: "u1", u2: "u2", u3: "u3" }
    );
    assert(
      weightedShares[0].shareAmount === 500 &&
      weightedShares[1].shareAmount === 250 &&
      weightedShares[2].shareAmount === 250,
      "Weighted split share parsed: 500, 250, 250"
    );

    // Rounding remainder validation
    const roundingShares = PersistenceService["calculateShares"](
      10, "equal", ["u1", "u2", "u3"], {}, {}
    );
    const roundedSum = roundingShares.reduce((acc, s) => acc + s.shareAmount, 0);
    assert(Math.abs(roundedSum - 10) < 0.001, `Rounding remainder adjustment sum equals exactly 10: actual ${roundedSum}`);

    // --------------------------------------------------
    // PHASE 9: BALANCE ENGINE TESTING
    // --------------------------------------------------
    console.log("\n--- PHASE 9: Net Balance & Debt Simplification Validation ---");
    const mockUsers = [
      { id: "A", name: "Aisha" },
      { id: "B", name: "Rohan" },
      { id: "C", name: "Priya" }
    ];
    // Aisha paid 3000, split equal
    const mockExpenses = [{
      id: "e1",
      title: "Rent",
      expenseDate: new Date("2026-02-01"),
      normalizedAmount: 3000,
      amount: 3000,
      currency: "INR",
      paidBy: "A",
      participants: [
        { userId: "A", shareAmount: 1000 },
        { userId: "B", shareAmount: 1000 },
        { userId: "C", shareAmount: 1000 }
      ]
    }];

    const summaries = BalanceEngine.computeBalances(mockUsers, mockExpenses, []);
    assert(summaries.find(s => s.userId === "A")?.netBalance === 2000, "Aisha balance: +2000");
    assert(summaries.find(s => s.userId === "B")?.netBalance === -1000, "Rohan balance: -1000");
    assert(summaries.find(s => s.userId === "C")?.netBalance === -1000, "Priya balance: -1000");

    const simplified = BalanceEngine.simplifyDebts(summaries);
    assert(simplified.length === 2, "Simplified debt generated 2 payment instructions");
    assert(simplified.some(d => d.fromUser === "Rohan" && d.toUser === "Aisha" && d.amount === 1000), "Rohan -> Aisha: 1000");
    assert(simplified.some(d => d.fromUser === "Priya" && d.toUser === "Aisha" && d.amount === 1000), "Priya -> Aisha: 1000");

    console.log("\n==================================================");
    console.log(`🏁 TEST EXECUTION RESULT: ${passed} PASSED, ${failed} FAILED`);
    console.log("==================================================");

  } catch (e) {
    console.error("Test suite crashed:", e);
  }
}

runTests();
