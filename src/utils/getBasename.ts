export function getBasename(filepath: string): string {
  return filepath.split("/").pop() || "";
}
