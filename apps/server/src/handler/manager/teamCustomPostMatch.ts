import prismaClient from "../../prismaClient.js";
import { createCustomPostMatchHandlers } from "./customPostMatch.js";

const select = { number: true, customPostMatch: true } as const;
export const customPostMatchHandlers = createCustomPostMatchHandlers({
  readByCode: (code) =>
    prismaClient.registeredTeam.findUnique({ where: { code }, select }),
  readByTeam: (number) =>
    prismaClient.registeredTeam.findUnique({ where: { number }, select }),
  update: (number, customPostMatch) =>
    prismaClient.registeredTeam.update({
      where: { number },
      data: { customPostMatch },
      select,
    }),
});
