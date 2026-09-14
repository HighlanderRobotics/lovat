import { Hono } from "hono";
import ticketsRouter from "./tickets";

const router = new Hono();

router.route("/tickets", ticketsRouter);

export default router;
