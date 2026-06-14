"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma = new client_1.PrismaClient();
async function main() {
    console.log("🌱 Seeding database...");
    // 1. Clean up database
    await prisma.auditLog.deleteMany();
    await prisma.importAnomaly.deleteMany();
    await prisma.importJob.deleteMany();
    await prisma.expenseParticipant.deleteMany();
    await prisma.expense.deleteMany();
    await prisma.settlement.deleteMany();
    await prisma.groupMembership.deleteMany();
    await prisma.group.deleteMany();
    await prisma.user.deleteMany();
    // 2. Create Users
    const passwordHash = await bcryptjs_1.default.hash("password123", 10);
    const usersData = [
        { name: "Aisha", email: "aisha@example.com" },
        { name: "Rohan", email: "rohan@example.com" },
        { name: "Priya", email: "priya@example.com" },
        { name: "Meera", email: "meera@example.com" },
        { name: "Sam", email: "sam@example.com" },
        { name: "Dev", email: "dev@example.com" },
        { name: "retik", email: "retik@example.com" },
        { name: "ashmita", email: "ashmita@example.com" },
        { name: "neha", email: "neha@example.com" }
    ];
    const usersMap = {};
    for (const u of usersData) {
        const user = await prisma.user.create({
            data: {
                name: u.name,
                email: u.email,
                passwordHash
            }
        });
        usersMap[u.name] = user;
        console.log(`Created user: ${u.name} (${u.email})`);
    }
    // 3. Create Group
    const group = await prisma.group.create({
        data: {
            name: "Shared Expense Group",
            createdBy: usersMap["Aisha"].id
        }
    });
    console.log(`Created group: ${group.name}`);
    // 4. Create Historical Memberships
    // Aisha: joined Feb 1, 2026
    await prisma.groupMembership.create({
        data: {
            groupId: group.id,
            userId: usersMap["Aisha"].id,
            joinedAt: new Date(Date.UTC(2026, 1, 1)) // Feb 1, 2026
        }
    });
    // Rohan: joined Feb 1, 2026
    await prisma.groupMembership.create({
        data: {
            groupId: group.id,
            userId: usersMap["Rohan"].id,
            joinedAt: new Date(Date.UTC(2026, 1, 1)) // Feb 1, 2026
        }
    });
    // Priya: joined Feb 1, 2026
    await prisma.groupMembership.create({
        data: {
            groupId: group.id,
            userId: usersMap["Priya"].id,
            joinedAt: new Date(Date.UTC(2026, 1, 1)) // Feb 1, 2026
        }
    });
    // Meera: joined Feb 1, 2026, left Mar 31, 2026
    await prisma.groupMembership.create({
        data: {
            groupId: group.id,
            userId: usersMap["Meera"].id,
            joinedAt: new Date(Date.UTC(2026, 1, 1)), // Feb 1, 2026
            leftAt: new Date(Date.UTC(2026, 2, 31)) // Mar 31, 2026
        }
    });
    // Sam: joined Apr 8, 2026
    await prisma.groupMembership.create({
        data: {
            groupId: group.id,
            userId: usersMap["Sam"].id,
            joinedAt: new Date(Date.UTC(2026, 3, 8)) // Apr 8, 2026
        }
    });
    // Dev: joined Feb 1, 2026 (Dev visiting/joining trip)
    await prisma.groupMembership.create({
        data: {
            groupId: group.id,
            userId: usersMap["Dev"].id,
            joinedAt: new Date(Date.UTC(2026, 1, 1)) // Feb 1, 2026
        }
    });
    console.log("✅ Database seeding completed successfully!");
}
main()
    .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
