const database = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (
  !["localhost", "127.0.0.1"].includes(database.hostname) ||
  database.pathname !== "/lovat_test"
) {
  throw new Error(
    "The training preview requires the disposable local lovat_test database.",
  );
}
process.env.NODE_ENV = "development";
process.env.DOTENV_CONFIG_PATH = "/dev/null";
process.env.AUTH0_DOMAIN ??= "auth.test.invalid";
const { app } = await import("../src/app.js");
const { attachTrainingSockets } =
  await import("../src/handler/training/trainingSockets.js");
const server = app.listen(3002, "127.0.0.1", () =>
  console.log("Local training API: http://127.0.0.1:3002"),
);
attachTrainingSockets(server);
