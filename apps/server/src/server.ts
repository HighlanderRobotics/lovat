import { app } from "./app.js";
import scheduleJobs from "./lib/scheduleJobs.js";

const port = process.env.PORT || 3000;

await scheduleJobs();

app.listen(port, () => {
  console.log(`Server running on :${port}`);
});
