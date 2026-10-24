const PREFIX = "cq-alerted:";
const today = () => new Date().toISOString().slice(0, 10);

export function wasAlertedToday(reportId: string): boolean {
  return localStorage.getItem(PREFIX + reportId) === today();
}

export function markAlerted(reportId: string) {
  localStorage.setItem(PREFIX + reportId, today());
}

export function resetAlertMemory() {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith(PREFIX)) localStorage.removeItem(key);
  }
}
