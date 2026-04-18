import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

import type { MemberSummary } from "@/db/members";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

// Mock the actions module
vi.mock("@/app/(app)/workspace/members/actions", () => ({
  inviteMemberAction: vi.fn(),
  removeMemberAction: vi.fn(),
  transferOwnerAction: vi.fn(),
}));

import { MembersClient } from "../MembersClient";
import {
  inviteMemberAction,
  removeMemberAction,
  transferOwnerAction,
} from "@/app/(app)/workspace/members/actions";

const mockInvite = vi.mocked(inviteMemberAction);
const mockRemove = vi.mocked(removeMemberAction);
const mockTransfer = vi.mocked(transferOwnerAction);

const ownerMember: MemberSummary = {
  uid: "uid-owner",
  role: "owner",
  addedAt: null,
  email: "owner@example.com",
  displayName: "Owner User",
};

const editorMember: MemberSummary = {
  uid: "uid-editor",
  role: "editor",
  addedAt: null,
  email: "editor@example.com",
  displayName: "Editor User",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockInvite.mockResolvedValue({ data: { cardsUpdated: 0, elapsed: 0 } } as ReturnType<
    typeof inviteMemberAction
  > extends Promise<infer R>
    ? R
    : never);
  mockRemove.mockResolvedValue({ data: { cardsUpdated: 0, elapsed: 0 } } as ReturnType<
    typeof removeMemberAction
  > extends Promise<infer R>
    ? R
    : never);
  mockTransfer.mockResolvedValue({ data: { cardsUpdated: 0, elapsed: 0 } } as ReturnType<
    typeof transferOwnerAction
  > extends Promise<infer R>
    ? R
    : never);
});

describe("MembersClient", () => {
  it("renders member list with roles", () => {
    render(
      <MembersClient members={[ownerMember, editorMember]} currentUid="uid-owner" isOwner={true} />,
    );

    expect(screen.getByText("Owner User")).toBeInTheDocument();
    expect(screen.getByText("Editor User")).toBeInTheDocument();
    expect(screen.getByText("擁有者")).toBeInTheDocument();
    expect(screen.getByText("編輯")).toBeInTheDocument();
  });

  it("shows invite form only when isOwner=true", () => {
    const { rerender } = render(
      <MembersClient members={[ownerMember]} currentUid="uid-owner" isOwner={true} />,
    );
    expect(screen.getByRole("textbox", { name: /邀請成員 Email/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "邀請" })).toBeInTheDocument();

    rerender(<MembersClient members={[ownerMember]} currentUid="uid-owner" isOwner={false} />);
    expect(screen.queryByRole("textbox", { name: /邀請成員 Email/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "邀請" })).not.toBeInTheDocument();
  });

  it("invite form submit calls inviteMemberAction with the email", async () => {
    const user = userEvent.setup();
    render(<MembersClient members={[ownerMember]} currentUid="uid-owner" isOwner={true} />);

    const input = screen.getByRole("textbox", { name: /邀請成員 Email/i });
    await user.type(input, "newmember@example.com");
    await user.click(screen.getByRole("button", { name: "邀請" }));

    await waitFor(() => {
      expect(mockInvite).toHaveBeenCalledWith({ email: "newmember@example.com" });
    });
  });

  it("remove button is disabled on self (current owner cannot remove themselves)", () => {
    render(
      <MembersClient
        members={[ownerMember, editorMember]}
        currentUid="uid-editor"
        isOwner={false}
      />,
    );
    // Non-owner sees no remove buttons
    expect(screen.queryByRole("button", { name: /移除成員/i })).not.toBeInTheDocument();
  });

  it("owner cannot see remove button for themselves (owner row has no remove btn)", () => {
    render(
      <MembersClient members={[ownerMember, editorMember]} currentUid="uid-owner" isOwner={true} />,
    );
    // Remove button exists for editor, not for owner
    const removeButtons = screen.queryAllByRole("button", { name: /移除成員/i });
    expect(removeButtons).toHaveLength(1);
    expect(removeButtons[0]).toHaveAttribute("aria-label", "移除成員 Editor User");
  });

  it("transfer button shows confirm dialog and calls transferOwnerAction on confirm", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(
      <MembersClient members={[ownerMember, editorMember]} currentUid="uid-owner" isOwner={true} />,
    );

    const transferBtn = screen.getByRole("button", { name: /設 Editor User 為擁有者/i });
    await user.click(transferBtn);

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("Editor User"));
    await waitFor(() => {
      expect(mockTransfer).toHaveBeenCalledWith({ newOwnerUid: "uid-editor" });
    });
  });

  it("transfer button does NOT call transferOwnerAction when confirm is cancelled", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(false);

    render(
      <MembersClient members={[ownerMember, editorMember]} currentUid="uid-owner" isOwner={true} />,
    );

    const transferBtn = screen.getByRole("button", { name: /設 Editor User 為擁有者/i });
    await user.click(transferBtn);

    expect(window.confirm).toHaveBeenCalled();
    expect(mockTransfer).not.toHaveBeenCalled();
  });

  it("shows invite error message when server returns an error", async () => {
    const user = userEvent.setup();
    mockInvite.mockResolvedValue({
      serverError: "此 Email 不在系統白名單",
    } as ReturnType<typeof inviteMemberAction> extends Promise<infer R> ? R : never);

    render(<MembersClient members={[ownerMember]} currentUid="uid-owner" isOwner={true} />);

    const input = screen.getByRole("textbox", { name: /邀請成員 Email/i });
    await user.type(input, "blocked@example.com");
    await user.click(screen.getByRole("button", { name: "邀請" }));

    await waitFor(() => {
      expect(screen.getByText("此 Email 不在系統白名單")).toBeInTheDocument();
    });
  });

  it("remove button calls removeMemberAction for editor member", async () => {
    const user = userEvent.setup();
    render(
      <MembersClient members={[ownerMember, editorMember]} currentUid="uid-owner" isOwner={true} />,
    );

    const removeBtn = screen.getByRole("button", { name: /移除成員 Editor User/i });
    await user.click(removeBtn);

    await waitFor(() => {
      expect(mockRemove).toHaveBeenCalledWith({ targetUid: "uid-editor" });
    });
  });
});
