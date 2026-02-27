//this file create session store

import type { Avatar } from "@prisma/client";

declare module "express-session" {
  interface SessionData {
    user?: {
      id: number;
      email: string;
      name: string | null;
      cleanId: string;
      avatar?: Avatar | null;
      provider: "email";
    };
  }
}

export {};
