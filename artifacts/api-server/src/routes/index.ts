import { Router, type IRouter } from "express";
import healthRouter from "./health";
import candidatesRouter from "./candidates";
import interviewsRouter from "./interviews";
import questionsRouter from "./questions";
import adminRouter from "./admin";
import transcribeRouter from "./transcribe";
import statsRouter from "./stats";
import userAuthRouter from "./user-auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(candidatesRouter);
router.use(interviewsRouter);
router.use(questionsRouter);
router.use(adminRouter);
router.use(userAuthRouter);
router.use(statsRouter);
router.use(transcribeRouter);

export default router;
