import styles from "./StatCard.module.css";

interface StatCardProps {
  label: string;
  value: number | string;
  hint?: string;
  emphasis?: "default" | "accent";
}

export function StatCard({ label, value, hint, emphasis = "default" }: StatCardProps) {
  return (
    <div className={emphasis === "accent" ? styles.cardAccent : styles.card}>
      <p className={styles.label}>{label}</p>
      <p className={styles.value}>{value}</p>
      {hint && <p className={styles.hint}>{hint}</p>}
    </div>
  );
}
