import prisma from "./prismaClient.js";
async function main() {
  const featureToggleSlackVerification = await prisma.featureToggle.create({
    data: {
      feature: "fullRegistration",
      enabled: false,
    },
  });
}
main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
