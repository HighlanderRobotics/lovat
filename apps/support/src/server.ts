import { app } from "./app";

const port = Number(process.env.PORT ?? 3000);

export default {
  hostname: "0.0.0.0",
  port,
  fetch: app.fetch,
};
