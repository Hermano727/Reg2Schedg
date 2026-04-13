export function isUcsdEmail(email: string | null | undefined): boolean {
  return typeof email === "string" && email.toLowerCase().endsWith("@ucsd.edu");
}
