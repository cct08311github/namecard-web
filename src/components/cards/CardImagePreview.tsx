import "server-only";

import { signedUrlFor } from "@/lib/storage/card-images";

import styles from "./CardImagePreview.module.css";

interface CardImagePreviewProps {
  /** Storage path written by the OCR scan flow. */
  frontImagePath?: string;
  backImagePath?: string;
}

/**
 * Server component — mints a fresh signed URL per image at render time
 * and renders it inline in the card detail sidebar. Returns null when
 * no images so we don't reserve UI space for a missing card photo.
 *
 * Click-through opens the image in a new tab — sufficient for "I want
 * to see the original" without adding a lightbox dependency.
 */
export async function CardImagePreview({ frontImagePath, backImagePath }: CardImagePreviewProps) {
  if (!frontImagePath && !backImagePath) return null;

  const [frontUrl, backUrl] = await Promise.all([
    frontImagePath ? safeSign(frontImagePath) : Promise.resolve(null),
    backImagePath ? safeSign(backImagePath) : Promise.resolve(null),
  ]);

  if (!frontUrl && !backUrl) return null;

  return (
    <section className={styles.section} aria-label="名片照片">
      <h2 className={styles.title}>名片照片</h2>
      <div className={styles.stack}>
        {frontUrl && (
          <a
            href={frontUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.imageLink}
            aria-label="名片正面（點擊放大）"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={frontUrl}
              alt="名片正面"
              className={styles.image}
              loading="lazy"
              decoding="async"
            />
          </a>
        )}
        {backUrl && (
          <a
            href={backUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.imageLink}
            aria-label="名片背面（點擊放大）"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={backUrl}
              alt="名片背面"
              className={styles.image}
              loading="lazy"
              decoding="async"
            />
          </a>
        )}
      </div>
    </section>
  );
}

/**
 * Wrap signedUrlFor so a missing/inaccessible storage object doesn't
 * break the whole card detail render — the image just won't appear.
 */
async function safeSign(path: string): Promise<string | null> {
  try {
    return await signedUrlFor(path);
  } catch {
    return null;
  }
}
