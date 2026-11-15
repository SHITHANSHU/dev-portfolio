import type { ProjectStatus } from "@/lib/content/schema";

const label: Record<ProjectStatus, string> = {
  idea: "Idea",
  "in-progress": "In progress",
  completed: "Completed",
  archived: "Archived",
};
/** Shape marker + text, so status never relies on colour alone. */
const mark: Record<ProjectStatus, string> = { idea: "○", "in-progress": "◑", completed: "●", archived: "▫" };

export function StatusBadge({ status }: { status: ProjectStatus }) {
  return (
    <span className="meta inline-flex items-center gap-1.5 whitespace-nowrap">
      <span aria-hidden className="text-signal">{mark[status]}</span>{label[status]}
    </span>
  );
}
