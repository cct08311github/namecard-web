import { ScanFlow } from "@/components/scan/ScanFlow";

import styles from "./scan.module.css";

export const metadata = {
  title: "拍照辨識",
};

export default function ScanCardPage() {
  return (
    <article className={styles.article}>
      <header className={styles.header}>
        <p className={styles.kicker}>拍照辨識</p>
        <h1 className={styles.title}>
          <em>一秒拍照</em>、10 秒歸檔
        </h1>
        <p className={styles.lead}>
          上傳或用相機拍一張名片。系統會辨識 → 你校對 → 語音補一句「為什麼記得這個人」→ 存檔。
        </p>
      </header>
      <ScanFlow />
    </article>
  );
}
