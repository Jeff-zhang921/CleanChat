//npx ts-node src/seed.ts

import { PrismaClient } from "@prisma/client";
import { DEFAULT_AVATAR } from "./avatar";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const hostEmail = "host@cleanchat.dev";

  const host = await prisma.user.upsert({
    where: { email: hostEmail },
    update: { name: "Host User", avatar: DEFAULT_AVATAR, cleanId: "host" },
    create: {
      email: hostEmail,
      name: "Host User",
      avatar: DEFAULT_AVATAR,
      cleanId: "host",
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
