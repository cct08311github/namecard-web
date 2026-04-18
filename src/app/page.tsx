import { SideRail } from "@/components/nav/SideRail";

import styles from "./home.module.css";

export default function Home() {
  return (
    <div className={styles.shell}>
      <SideRail />
      <main className={styles.main}>
        <article className={styles.article}>
          <p className={styles.kicker}>Foundation · Phase 1</p>
          <h1 className={styles.title}>
            一份用心編排的<em>名片冊</em>，
            <br />
            不是又一個 SaaS Dashboard。
          </h1>
          <p className={styles.lead}>
            Namecard Web 把「關係脈絡」做成第一等公民—— 比起重複拍照、儲存、忘記，
            這裡在意的是「為什麼記得這個人」與「上一次見面是哪一場」。
          </p>

          <dl className={styles.meta}>
            <div>
              <dt>差異化</dt>
              <dd>首頁不是名片列表，是「最近沒聯絡的人 / 這個月認識」時間軸。</dd>
            </div>
            <div>
              <dt>技術棧</dt>
              <dd>Next.js 16 · Firebase · MiniMax M2.7 · Typesense · Mac mini M4</dd>
            </div>
            <div>
              <dt>下一步</dt>
              <dd>Phase 2：Google 登入 + 手動名片 CRUD + 時間軸首頁上線。</dd>
            </div>
          </dl>
        </article>
      </main>
    </div>
  );
}
