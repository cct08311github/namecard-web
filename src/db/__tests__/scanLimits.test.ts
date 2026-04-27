import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

// Mock the firebase server module (server-only) before importing scanLimits
vi.mock("@/lib/firebase/server", () => ({
  getAdminFirestore: vi.fn(),
}));

// Also mock "server-only" because firebase/server imports it
vi.mock("server-only", () => ({}));

import { getAdminFirestore } from "@/lib/firebase/server";
import { incrementAndCheckScanLimit } from "../scanLimits";

type TxFn = (tx: { get: Mock; set: Mock }) => Promise<number>;

function makeFirestoreMock(existingCount: number | null) {
  const setMock = vi.fn();
  const getMock = vi
    .fn()
    .mockResolvedValue(
      existingCount === null
        ? { exists: false }
        : { exists: true, data: () => ({ count: existingCount }) },
    );

  const runTransactionMock = vi.fn().mockImplementation(async (fn: TxFn) => {
    return fn({ get: getMock, set: setMock });
  });

  const docMock = vi.fn().mockReturnValue({
    /* DocumentReference stub */
  });

  return {
    db: { runTransaction: runTransactionMock, doc: docMock },
    setMock,
    getMock,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("incrementAndCheckScanLimit", () => {
  it("allows the first scan (counter starts at 0)", async () => {
    const { db } = makeFirestoreMock(null /* doc does not exist */);
    (getAdminFirestore as Mock).mockReturnValue(db);

    const result = await incrementAndCheckScanLimit("uid-123", 50);

    expect(result.allowed).toBe(true);
    expect(result.usedToday).toBe(1);
  });

  it("allows a scan when count is below the limit", async () => {
    const { db } = makeFirestoreMock(30);
    (getAdminFirestore as Mock).mockReturnValue(db);

    const result = await incrementAndCheckScanLimit("uid-123", 50);

    expect(result.allowed).toBe(true);
    expect(result.usedToday).toBe(31);
  });

  it("allows the scan exactly at the limit (50th scan is allowed)", async () => {
    const { db } = makeFirestoreMock(49);
    (getAdminFirestore as Mock).mockReturnValue(db);

    const result = await incrementAndCheckScanLimit("uid-123", 50);

    expect(result.allowed).toBe(true);
    expect(result.usedToday).toBe(50);
  });

  it("denies the scan when limit is already exceeded", async () => {
    const { db } = makeFirestoreMock(50);
    (getAdminFirestore as Mock).mockReturnValue(db);

    const result = await incrementAndCheckScanLimit("uid-123", 50);

    expect(result.allowed).toBe(false);
    expect(result.usedToday).toBe(51);
  });

  it("denies when custom limit of 1 is already reached", async () => {
    const { db } = makeFirestoreMock(1);
    (getAdminFirestore as Mock).mockReturnValue(db);

    const result = await incrementAndCheckScanLimit("uid-abc", 1);

    expect(result.allowed).toBe(false);
    expect(result.usedToday).toBe(2);
  });
});
