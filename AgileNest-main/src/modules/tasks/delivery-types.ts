export type AcceptanceCriterion = { id: string; text: string };

export type DeliveryInput = {
  requirementsVersion: number;
  summary: string;
  verification: string;
  links: { title: string; url: string }[];
  resourceIds: string[];
  checks: { criterionId: string; met: boolean; note?: string }[];
};

export type ReviewInput = {
  submissionId: string;
  summary: string;
  checks: { criterionId: string; passed: boolean; note?: string }[];
};

export type SubmissionDTO = {
  id: string;
  taskId: string;
  version: number;
  submittedById: string | null;
  submittedByName: string | null;
  submittedAt: string;
  summary: string;
  verification: string;
  links: { title: string; url: string }[];
  resources: { id: string; title: string; fileName: string | null; mimeType: string | null; size: number }[];
  criteria: { id: string; text: string; met: boolean; note?: string }[];
  review: {
    action: "accept" | "reject";
    reviewerName: string | null;
    reviewedAt: string;
    summary: string;
    checks: { criterionId: string; passed: boolean; note?: string }[];
  } | null;
  source: "structured" | "legacy";
};

export type TaskDeliveryDTO = {
  requirements: { version: number; criteria: AcceptanceCriterion[] };
  submissions: SubmissionDTO[];
};
