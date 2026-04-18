import { redirect } from "next/navigation";

import { listWorkspaceMembers } from "@/db/members";
import { readSession } from "@/lib/firebase/session";
import { personalWorkspaceId } from "@/lib/firebase/shared";

import { MembersClient } from "./MembersClient";
import styles from "./members.module.css";

export const metadata = { title: "成員管理" };

export default async function WorkspaceMembersPage() {
  const user = await readSession();
  if (!user) redirect("/login");

  const wid = personalWorkspaceId(user.uid);
  const members = await listWorkspaceMembers(wid, user.uid);
  const isOwner = members.find((m) => m.uid === user.uid)?.role === "owner";

  return (
    <section className={styles.section}>
      <header className={styles.header}>
        <h1 className={styles.title}>成員</h1>
        <p className={styles.lede}>
          管理可以讀寫這份名片冊的人。
          <strong>邀請前，Email 必須在 ALLOWED_EMAILS 環境變數中。</strong>
        </p>
      </header>
      <MembersClient members={members} currentUid={user.uid} isOwner={isOwner} />
    </section>
  );
}
