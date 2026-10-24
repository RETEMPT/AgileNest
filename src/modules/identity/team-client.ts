export type TeamInformationDTO = {
  id: string;
  name: string;
  description: string;
  website: string | null;
  contactEmail: string | null;
  inviteCode: string;
  inviteExpiresOn: string | null;
  version: number;
  updatedAt: string;
};

export type TeamAnnouncementDTO = {
  id: string;
  teamId: string;
  title: string;
  body: string;
  pinned: boolean;
  version: number;
  authorName: string | null;
  createdAt: string;
  updatedAt: string;
};
