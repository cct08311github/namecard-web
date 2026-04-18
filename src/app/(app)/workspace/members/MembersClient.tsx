"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { MemberSummary } from "@/db/members";

import { inviteMemberAction, removeMemberAction, transferOwnerAction } from "./actions";
import styles from "./members.module.css";

interface MembersClientProps {
  members: MemberSummary[];
  currentUid: string;
  isOwner: boolean;
}

export function MembersClient({ members, currentUid, isOwner }: MembersClientProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);

  function runWithRefresh(fn: () => Promise<void>) {
    startTransition(async () => {
      await fn();
      router.refresh();
    });
  }

  function onInvite() {
    const trimmed = email.trim();
    if (!trimmed) return;
    setInviteError(null);
    runWithRefresh(async () => {
      const res = await inviteMemberAction({ email: trimmed });
      if (res?.serverError) {
        setInviteError(res.serverError);
      } else {
        setEmail("");
      }
    });
  }

  function onRemove(targetUid: string, displayName: string) {
    runWithRefresh(async () => {
      const res = await removeMemberAction({ targetUid });
      if (res?.serverError) {
        alert(`移除失敗：${res.serverError}`);
      }
    });
    void displayName;
  }

  function onTransfer(newOwnerUid: string, displayLabel: string) {
    const confirmed = window.confirm(`將擁有者轉移給 ${displayLabel}？此動作不可逆。`);
    if (!confirmed) return;
    runWithRefresh(async () => {
      const res = await transferOwnerAction({ newOwnerUid });
      if (res?.serverError) {
        alert(`轉移失敗：${res.serverError}`);
      }
    });
  }

  return (
    <>
      {isOwner && (
        <div>
          <div className={styles.inviteForm}>
            <input
              className={styles.inviteInput}
              type="email"
              placeholder="輸入 Email 邀請成員"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onInvite();
              }}
              disabled={pending}
              aria-label="邀請成員 Email"
            />
            <button
              type="button"
              className={styles.inviteBtn}
              onClick={onInvite}
              disabled={pending || !email.trim()}
            >
              邀請
            </button>
          </div>
          {inviteError && <p className={styles.inviteError}>{inviteError}</p>}
        </div>
      )}

      {members.length === 0 ? (
        <p className={styles.empty}>目前沒有成員。</p>
      ) : (
        <ul className={styles.list}>
          {members.map((member) => {
            const displayName = member.displayName ?? member.email ?? member.uid;
            const isCurrentUser = member.uid === currentUid;
            const isOwnerMember = member.role === "owner";

            return (
              <li key={member.uid} className={styles.row}>
                <div className={styles.memberInfo}>
                  <span className={styles.memberName}>{displayName}</span>
                  {member.email && member.displayName && (
                    <span className={styles.memberEmail}>{member.email}</span>
                  )}
                </div>

                <span
                  className={styles.roleBadge}
                  data-role={member.role}
                  aria-label={`角色：${isOwnerMember ? "擁有者" : "編輯"}`}
                >
                  {isOwnerMember ? "擁有者" : "編輯"}
                </span>

                {isOwner && !isOwnerMember && (
                  <button
                    type="button"
                    className={styles.actionBtn}
                    onClick={() => onTransfer(member.uid, displayName)}
                    disabled={pending}
                    aria-label={`設 ${displayName} 為擁有者`}
                  >
                    設為擁有者
                  </button>
                )}

                {isOwner && !isOwnerMember && (
                  <button
                    type="button"
                    className={styles.removeBtn}
                    onClick={() => onRemove(member.uid, displayName)}
                    disabled={pending || isCurrentUser}
                    aria-label={`移除成員 ${displayName}`}
                  >
                    ✕
                  </button>
                )}

                {/* Spacers for owner row to maintain grid alignment */}
                {isOwner && isOwnerMember && !isCurrentUser && (
                  <>
                    <span aria-hidden="true" />
                    <span aria-hidden="true" />
                  </>
                )}

                {(!isOwner || (isOwner && isOwnerMember && isCurrentUser)) && (
                  <>
                    <span aria-hidden="true" />
                    <span aria-hidden="true" />
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
