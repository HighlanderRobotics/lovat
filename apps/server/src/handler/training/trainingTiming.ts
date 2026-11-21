export const TRAINING_POST_ROLL_SECONDS = 15;

export function trainingPlaybackEnd(
  startedAt: Date,
  durationSeconds: number,
): number {
  return (
    startedAt.getTime() + (durationSeconds + TRAINING_POST_ROLL_SECONDS) * 1000
  );
}
