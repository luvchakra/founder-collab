import { StatusBadge, type StatusTone } from "@cofounderai/core/ui/status-badge";
import {
  CAMPAIGN_STATUS_LABEL,
  CONTENT_STATUS_LABEL,
  type CampaignStatus,
  type ContentStatus,
} from "../../lib/marketing/types";

const CAMPAIGN_TONE: Record<CampaignStatus, StatusTone> = {
  draft: "secondary",
  planned: "default",
  active: "success",
  paused: "warning",
  completed: "default",
  archived: "secondary",
};

const CONTENT_TONE: Record<ContentStatus, StatusTone> = {
  idea: "secondary",
  draft: "secondary",
  review: "warning",
  approved: "default",
  scheduled: "default",
  published: "success",
  archived: "secondary",
};

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  return <StatusBadge status={status} label={CAMPAIGN_STATUS_LABEL[status]} tone={CAMPAIGN_TONE[status]} />;
}

export function ContentStatusBadge({ status }: { status: ContentStatus }) {
  return <StatusBadge status={status} label={CONTENT_STATUS_LABEL[status]} tone={CONTENT_TONE[status]} />;
}
