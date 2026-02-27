declare module "express-session" {
  interface SessionData {
    user?: {
      id: number;
      email: string;
      name: string | null;
      provider: "email";
    };
    location?: {
      latitude: number;
      longitude: number;
      accuracy?: number | null;
      updatedAt: string;
    };
  }
}

export {};
