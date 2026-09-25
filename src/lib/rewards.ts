// Progress toward a reward. Only stamps earned at/after the reward's created_at count.
export function rewardProgress(
  stampTimesMs: number[],
  rewardCreatedAtIso: string,
  requiredStamps: number
): { progress: number; unlocked: boolean } {
  const anchor = new Date(rewardCreatedAtIso).getTime();
  const progress = stampTimesMs.filter((t) => t >= anchor).length;
  return { progress, unlocked: progress >= requiredStamps };
}
