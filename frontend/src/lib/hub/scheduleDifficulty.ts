export function getScheduleDifficultyLabel(score: number): string {
  if (score <= 2.0) return "Easy Schedule";
  if (score <= 4.0) return "Moderate Schedule";
  if (score <= 6.0) return "Moderately Challenging Schedule";
  if (score <= 8.0) return "Challenging Schedule";
  if (score < 9.7) return "Very Challenging Schedule";
  return "Impossible Schedule";
}
