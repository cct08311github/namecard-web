import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { FieldMappingDialog } from "../FieldMappingDialog";
import type { CanonicalCardField } from "@/lib/csv/linkedin";

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const HEADERS = ["First Name", "Last Name", "Email Address", "Company", "Notes"];

const INITIAL_MAPPING: Record<string, CanonicalCardField> = {
  "First Name": "firstName",
  "Last Name": "lastName",
  "Email Address": "emailWork",
  Company: "companyEn",
  Notes: "notes",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("FieldMappingDialog", () => {
  it("1. renders all headers with dropdowns pre-filled from initialMapping", () => {
    render(
      <FieldMappingDialog
        headers={HEADERS}
        initialMapping={INITIAL_MAPPING}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );

    // Every header should be visible.
    for (const h of HEADERS) {
      expect(screen.getByText(h)).toBeInTheDocument();
    }

    // Each select should have the expected initial value.
    const firstNameSelect = screen.getByRole("combobox", { name: /First Name/ });
    expect((firstNameSelect as HTMLSelectElement).value).toBe("firstName");

    const emailSelect = screen.getByRole("combobox", { name: /Email Address/ });
    expect((emailSelect as HTMLSelectElement).value).toBe("emailWork");
  });

  it("2. changing a dropdown and clicking Confirm calls onConfirm with new mapping", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(
      <FieldMappingDialog
        headers={HEADERS}
        initialMapping={INITIAL_MAPPING}
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    );

    // Change Notes → ignored.
    const notesSelect = screen.getByRole("combobox", { name: /Notes/ });
    await user.selectOptions(notesSelect, "ignored");

    // Click Confirm.
    await user.click(screen.getByRole("button", { name: /確認匯入/ }));

    expect(onConfirm).toHaveBeenCalledOnce();
    const called = onConfirm.mock.calls[0][0] as Record<string, CanonicalCardField>;
    expect(called["Notes"]).toBe("ignored");
    // Other fields unchanged.
    expect(called["First Name"]).toBe("firstName");
  });

  it("3. Cancel button calls onCancel and not onConfirm", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <FieldMappingDialog
        headers={HEADERS}
        initialMapping={INITIAL_MAPPING}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    await user.click(screen.getByRole("button", { name: /取消/ }));

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("4. Escape key triggers onCancel", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();

    render(
      <FieldMappingDialog
        headers={HEADERS}
        initialMapping={INITIAL_MAPPING}
        onConfirm={() => {}}
        onCancel={onCancel}
      />,
    );

    await user.keyboard("{Escape}");

    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("5. ARIA: dialog has role=dialog and aria-modal=true", () => {
    render(
      <FieldMappingDialog
        headers={HEADERS}
        initialMapping={INITIAL_MAPPING}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("6. renders empty header list without crashing", () => {
    render(
      <FieldMappingDialog
        headers={[]}
        initialMapping={{}}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
