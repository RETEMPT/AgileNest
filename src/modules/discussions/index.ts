export { listTaskDiscussions, createTaskDiscussion, updateTaskDiscussion, withdrawTaskDiscussion, setDiscussionResolved, listDiscussionRevisions } from "./service";
export { taskDiscussionsGET, taskDiscussionsPOST, taskDiscussionGET, taskDiscussionPATCH } from "./api";
export type { DiscussionPostDTO, DiscussionResourceDTO, DiscussionListDTO, DiscussionRevisionDTO, DiscussionCreateInput, DiscussionEditInput, DiscussionResolveInput } from "./client";
