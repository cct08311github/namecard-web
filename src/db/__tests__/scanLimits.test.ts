import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock "server-only" so the module can be imported in test (jsdom) env.
vi.mock("server-only", () => ({}));

function buildMockDb(snapCount: number) {
  const mockSnap = { data: () => ({ count: snapCount }) };
  const mockTx = {
    get: vi.fn().mockResolvedValue(mockSnap),
    set: vi.fn(),
  };
  const mockDb = {
    collection: vi.fn().mockReturnThis(),
    doc: vi.fn().mockReturnThis(),
    runTransaction: vi
      .fn()
      .mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
  };
  return { mockDb, mockTx };
}

vi.mock("@/lib/firebase/server", () => ({
  getAdminFirestore: vi.fn(),
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    increment: (n: number) => ({ __increment: n }),
    serverTimestamp: () => ({ __serverTimestamp: true }),
  },
}));

import { getAdminFirestore } from "@/lib/firebase/server";
import { incrementAndCheckScanLimit } from "../scanLimits";

describe("incrementAndCheckScanLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("allows first scan when count is 0", async () => {
    const { mockDb, mockTx } = buildMockDb(0);
    vi.mocked(getAdminFirestore).mockReturnValue(mockDb as never);

    const result = await incrementAndCheckScanLimit("uid-1", 50);
    expect(result).toEqual({ allowed: true, usedToday: 1 });
    expect(mockTx.set).toHaveBeenCalledOnce();
  });

  it("allows scan when count is below limit", async () => {
    const { mockDb } = buildMockDb(20);
    vi.mocked(getAdminFirestore).mockReturnValue(mockDb as never);

    const result = await incrementAndCheckScanLimit("uid-1", 50);
    expect(result).toEqual({ allowed: true, usedToday: 21 });
  });

  it("rejects scan when count equals limit", async () => {
    const { mockDb, mockTx } = buildMockDb(50);
    vi.mocked(getAdminFirestore).mockReturnValue(mockDb as never);

    const result = await incrementAndCheckScanLimit("uid-1", 50);
    expect(result).toEqual({ allowed: false, usedToday: 50 });
    expect(mockTx.set).not.toHaveBeenCalled();
  });

  it("rejects scan when count exceeds limit", async () => {
    const { mockDb, mockTx } = buildMockDb(55);
    vi.mocked(getAdminFirestore).mockReturnValue(mockDb as never);

    const result = await incrementAndCheckScanLimit("uid-1", 50);
    expect(result).toEqual({ allowed: false, usedToday: 55 });
    expect(mockTx.set).not.toHaveBeenCalled();
  });

  it("uses today's date as the document key", async () => {
    const { mockDb } = buildMockDb(0);
    vi.mocked(getAdminFirestore).mockReturnValue(mockDb as never);

    await incrementAndCheckScanLimit("uid-abc", 10);

    const today = new Date().toISOString().slice(0, 10);
    // The chain: db.collection("users").doc(uid).collection("scanLimits").doc(today)
    expect(mockDb.doc).toHaveBeenCalledWith("uid-abc");
    expect(mockDb.doc).toHaveBeenCalledWith(today);
  });
});
