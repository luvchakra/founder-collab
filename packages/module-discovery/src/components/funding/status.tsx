import { StatusBadge, type StatusTone } from "@cofounderai/core/ui/status-badge";
import {
  DATA_ROOM_STATUS_LABEL,
  DILIGENCE_STATUS_LABEL,
  OUTREACH_STATUS_LABEL,
  PIPELINE_STAGE_LABEL,
  READINESS_STATUS_LABEL,
  ROUND_STATUS_LABEL,
  type DataRoomStatus,
  type DiligenceStatus,
  type OutreachStatus,
  type PipelineStage,
  type ReadinessStatus,
  type RoundStatus,
} from "../../lib/funding/types";

const ROUND: Record<RoundStatus, StatusTone> = { planning: "secondary", open: "success", paused: "warning", closed: "default", cancelled: "secondary" };
const STAGE = (s: PipelineStage): StatusTone =>
  s === "passed" ? "secondary" : s === "invested" || s === "committed" ? "success" : s === "due_diligence" || s === "term_discussion" ? "warning" : "default";
const OUTREACH: Record<OutreachStatus, StatusTone> = {
  draft: "secondary",
  awaiting_approval: "warning",
  approved: "default",
  sending: "warning",
  sent: "success",
  failed: "destructive",
  replied: "success",
  closed: "secondary",
};
const READINESS: Record<ReadinessStatus, StatusTone> = { ready: "success", needs_attention: "warning", missing: "destructive", not_applicable: "secondary" };
const DATA_ROOM: Record<DataRoomStatus, StatusTone> = { missing: "destructive", draft: "secondary", ready: "success", shared: "default", expired: "warning" };
const DILIGENCE: Record<DiligenceStatus, StatusTone> = {
  open: "secondary",
  in_progress: "default",
  submitted: "default",
  needs_clarification: "warning",
  accepted: "success",
  closed: "secondary",
};

export const RoundBadge = ({ status }: { status: RoundStatus }) => <StatusBadge status={status} label={ROUND_STATUS_LABEL[status]} tone={ROUND[status]} />;
export const StageBadge = ({ stage }: { stage: PipelineStage }) => <StatusBadge status={stage} label={PIPELINE_STAGE_LABEL[stage]} tone={STAGE(stage)} />;
export const OutreachBadge = ({ status }: { status: OutreachStatus }) => (
  <StatusBadge status={status} label={OUTREACH_STATUS_LABEL[status]} tone={OUTREACH[status]} />
);
export const ReadinessBadge = ({ status }: { status: ReadinessStatus }) => (
  <StatusBadge status={status} label={READINESS_STATUS_LABEL[status]} tone={READINESS[status]} />
);
export const DataRoomBadge = ({ status }: { status: DataRoomStatus }) => (
  <StatusBadge status={status} label={DATA_ROOM_STATUS_LABEL[status]} tone={DATA_ROOM[status]} />
);
export const DiligenceBadge = ({ status }: { status: DiligenceStatus }) => (
  <StatusBadge status={status} label={DILIGENCE_STATUS_LABEL[status]} tone={DILIGENCE[status]} />
);
