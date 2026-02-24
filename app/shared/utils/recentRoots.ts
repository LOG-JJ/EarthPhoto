export function mergeRecentRoots(recentRoots: string[], nextRoot: string): string[] {
  return [nextRoot, ...recentRoots.filter((item) => item !== nextRoot)].slice(0, 10);
}
