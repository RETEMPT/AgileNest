export { listResources, getResource, createResource, uploadResource, updateResource, deleteResource, listResourceRevisions, getResourceFile, bindSubmissionResources, bindDiscussionResources, bindTaskActionItemSource, accessibleResourceIds } from "./service";
export { resourcesGET, resourcesPOST, resourceGET, resourcePATCH, resourceDELETE, resourceFileGET } from "./api";
export type { ResourceDTO } from "./client";
export { listResourceFolders, createResourceFolder, updateResourceFolder, placeResource, getResourceCollaboration, setResourceCollaboration, linkResource, unlinkResource, listResourceLinks, listTaskResourceLinks, getResourceWorkspace, listResourceComments, createResourceComment, updateResourceComment, listResourceCommentHistory } from "./workspace-service";
export { resourceWorkspaceGET, resourceWorkspacePOST } from "./workspace-api";
export type { ResourceFolderDTO, ResourceLinkDTO, ResourceCommentDTO, ResourceCollaborationDTO } from "./client";
