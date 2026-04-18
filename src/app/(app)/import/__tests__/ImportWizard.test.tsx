/**
 * UT for ImportWizard.tsx — tests the key flows via jsdom.
 *
 * Mock strategy:
 *   - batchImportCardsAction → vi.mock (server action)
 *   - parseVcardFile, detectDuplicates → real (pure functions)
 *   - FieldMappingDialog → real
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import type { BatchImportResult } from "@/db/cards-batch";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockBatchImportCardsAction = vi.fn();

vi.mock("@/app/(app)/import/actions", () => ({
  batchImportCardsAction: (...args: unknown[]) => mockBatchImportCardsAction(...args),
}));

// ---------------------------------------------------------------------------
// Component under test (imported AFTER mocks)
// ---------------------------------------------------------------------------

import { ImportWizard } from "../ImportWizard";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Minimal VCF text for a single contact. */
const SINGLE_VCARD = `BEGIN:VCARD
VERSION:3.0
FN:Alice Chen
N:Chen;Alice;;;
EMAIL;TYPE=WORK:alice@example.com
ORG:Test Inc
TITLE:Engineer
END:VCARD`;

const EMPTY_EXISTING: import("@/db/cards").CardSummary[] = [];

function makeFile(content: string, name: string, type: string): File {
  return new File([content], name, { type });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ImportWizard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows parse preview after uploading a valid vCard file", async () => {
    render(<ImportWizard existingCards={EMPTY_EXISTING} />);

    // The upload screen should show the file input.
    const fileInput = screen.getByLabelText("選擇 vCard 檔案");
    expect(fileInput).toBeDefined();

    const file = makeFile(SINGLE_VCARD, "contacts.vcf", "text/vcard");
    fireEvent.change(fileInput, { target: { files: [file] } });

    // Wait for async FileReader + parse.
    await waitFor(() => {
      expect(screen.getByText("Alice Chen")).toBeDefined();
    });

    // Should show the preview heading.
    expect(screen.getByText(/預覽/)).toBeDefined();
  });

  it("shows a yellow chip for a duplicate row", async () => {
    // Existing card has same email as the incoming vCard.
    const existing: import("@/db/cards").CardSummary[] = [
      {
        id: "existing-1",
        workspaceId: "wid",
        ownerUid: "uid",
        memberUids: ["uid"],
        nameEn: "Alice Chen",
        whyRemember: "test",
        emails: [{ label: "work", value: "alice@example.com" }],
        phones: [],
        tagIds: [],
        tagNames: [],
        createdAt: null,
        updatedAt: null,
        lastContactedAt: null,
        deletedAt: null,
      },
    ];

    render(<ImportWizard existingCards={existing} />);

    const fileInput = screen.getByLabelText("選擇 vCard 檔案");
    const file = makeFile(SINGLE_VCARD, "contacts.vcf", "text/vcard");
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      // "重複 (email)" chip must appear.
      expect(screen.getByText("重複 (email)")).toBeDefined();
    });
  });

  it("calls batchImportCardsAction with correct shape on submit", async () => {
    const actionResult: BatchImportResult = {
      created: 1,
      merged: 0,
      skipped: 0,
      createdIds: ["new-id"],
      errors: [],
    };
    mockBatchImportCardsAction.mockResolvedValue({ data: actionResult });

    render(<ImportWizard existingCards={EMPTY_EXISTING} />);

    const fileInput = screen.getByLabelText("選擇 vCard 檔案");
    const file = makeFile(SINGLE_VCARD, "contacts.vcf", "text/vcard");
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText("Alice Chen")).toBeDefined();
    });

    // Click the submit button.
    const submitBtn = screen.getByRole("button", { name: /匯入/ });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockBatchImportCardsAction).toHaveBeenCalledOnce();
      const call = mockBatchImportCardsAction.mock.calls[0]![0] as {
        rows: unknown[];
        decisions: unknown[];
        source: string;
      };
      expect(call.source).toBe("vcard");
      expect(Array.isArray(call.rows)).toBe(true);
      expect(Array.isArray(call.decisions)).toBe(true);
      expect(call.rows.length).toBe(call.decisions.length);
    });
  });
});
