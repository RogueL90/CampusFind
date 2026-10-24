import { beforeAll, describe, expect, it, vi } from "vitest";
import { LEO, MAYA, MODERATOR, OFFICE, setCurrentUserId } from "./currentUser";
import * as mock from "./mock";

beforeAll(() => {
  const store = new Map<string, string>();
  vi.stubGlobal("window", { dispatchEvent: () => true, addEventListener: () => {}, removeEventListener: () => {} });
  vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) });
});

async function checkAs(user: string, stillThere: boolean) {
  setCurrentUserId(user);
  await mock.checkReport("r-tower-trash", stillThere);
  return (await mock.getReport("r-tower-trash"))!;
}

describe("checkReport (mock, mirrors check_report in schema.sql)", () => {
  it("timestamps checks, resets on 'still there', and resolves at 3", async () => {
    const before = (await mock.getReport("r-tower-trash"))!;
    expect(before.last_checked_at).toBeNull();

    let r = await checkAs(LEO, false);
    expect(r.resolved_votes).toBe(1);
    expect(r.last_check_still).toBe(false);
    expect(r.last_checked_at).not.toBeNull();

    r = await checkAs(MAYA, false);
    expect(r.resolved_votes).toBe(2);

    r = await checkAs(OFFICE, true);
    expect(r.resolved_votes).toBe(0);
    expect(r.last_check_still).toBe(true);
    expect(r.votes).toBe(before.votes + 1);

    await new Promise((res) => setTimeout(res, 5));
    await checkAs(LEO, false);
    await checkAs(MAYA, false);
    expect((await checkAs(LEO, false)).status).not.toBe("resolved");
    r = await checkAs(MODERATOR, false);
    expect(r.resolved_votes).toBe(3);
    expect(r.status).toBe("resolved");
  });
});
