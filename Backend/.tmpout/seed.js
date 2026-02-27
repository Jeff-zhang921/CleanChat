"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function main() {
    const hostEmail = "host@cleanchat.dev";
    const host = await prisma.user.upsert({
        where: { email: hostEmail },
        update: { name: "Host User" },
        create: {
            email: hostEmail,
            name: "Host User",
        },
    });
    console.log(`Seeded user: ${host.name} (${host.email})`);
}
main()
    .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
