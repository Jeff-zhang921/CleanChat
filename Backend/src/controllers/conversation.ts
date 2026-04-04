import type { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ensureAuth = (
  sessionUserId: number | undefined,
): sessionUserId is number =>
  typeof sessionUserId === "number" &&
  Number.isInteger(sessionUserId) &&
  sessionUserId > 0;

const parsePositiveInt = (raw: unknown): number | null => {
  const parsed = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isInteger(parsed) || Number.isNaN(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
};

const resolveConversationId = (request: Request) =>
  parsePositiveInt(request.params.id ?? request.params.threadId);

export const deleteConversation = async (
  request: Request,
  response: Response,
) => {
  const userId = request.user?.userId;
  if (!ensureAuth(userId)) {
    response.status(401).json({ message: "Unauthorized" });
    return;
  }

  const conversationId = resolveConversationId(request);
  if (!conversationId) {
    response.status(400).json({ message: "Invalid conversation ID" });
    return;
  }

  const thread = await prisma.chatThread.findUnique({
    where: { id: conversationId },
    select: { id: true, AID: true, BID: true },
  });

  if (!thread || (thread.AID !== userId && thread.BID !== userId)) {
    response.status(404).json({ message: "Conversation not found" });
    return;
  }

  const deletedMessageCount = await prisma.$transaction(async (tx) => {
    const deletedMessages = await tx.chatMessage.deleteMany({
      where: { threadId: conversationId },
    });

    await tx.chatThread.delete({
      where: { id: conversationId },
    });

    return deletedMessages.count;
  });

  response.status(200).json({
    conversationId,
    deletedMessages: deletedMessageCount,
    irreversible: true,
    message: "Conversation permanently deleted.",
  });
};
