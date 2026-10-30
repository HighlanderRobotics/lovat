import { get } from "./lovatAPI";
import z from "zod";

export const tournamentSchema = z.object({
  key: z.string(),
  name: z.string(),
  location: z.string(),
  date: z.string(),
});

export type Tournament = z.infer<typeof tournamentSchema>;

export const getTournaments = async () => {
  const response = await get("/collection/tournament");

  if (!response.ok) {
    throw new Error("Error fetching tournaments");
  }

  const json = await response.json();

  const { tournaments } = z
    .object({ tournaments: z.array(tournamentSchema) })
    .parse(json);

  return tournaments;
};
