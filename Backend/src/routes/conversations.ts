import { Router } from "express";
import { authMiddleware } from "../auth";
import { deleteConversation } from "../controllers/conversation";

const router = Router();

router.use(authMiddleware);
router.delete("/:id", deleteConversation);

export default router;
