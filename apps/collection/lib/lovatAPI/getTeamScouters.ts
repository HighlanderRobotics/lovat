import { get } from "./lovatAPI";
import { scouterSchema } from "../models/scouter";
import { z } from "zod";

export const getTeamScouters = async () => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await get(`/collection/scouter`, {
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error("Error fetching scouters");
    }

    const json = z.array(scouterSchema).parse(await response.json());

    return json;
  } finally {
    clearTimeout(timeout);
  }
};
