import type { EvidenceStatus } from "@/lib/content/schema";

const label: Record<EvidenceStatus, string> = {
  implemented: "Implemented",
  demonstrated: "Demonstrated",
  "in-progress": "In progress",
  planned: "Planned",
  exploratory: "Exploratory",
};
/** Shape marker + text, so status never relies on colour alone. */
const mark: Record<EvidenceStatus, string> = { implemented: "●", demonstrated: "◐", "in-progress": "◑", planned: "○", exploratory: "△" };

export function StatusBadge({ status }: { status: EvidenceStatus }) {
  return (
    <span className="meta inline-flex items-center gap-1.5 whitespace-nowrap">
      <span aria-hidden className="text-signal">{mark[status]}</span>{label[status]}
    </span>
  );
}
