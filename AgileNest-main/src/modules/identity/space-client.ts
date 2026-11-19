import { z } from "zod";

export const PROJECT_SPACE_DEPTH = 4;
export const projectSpaceSchema = z.object({ id: z.uuid(), parentId: z.uuid().nullable(), name: z.string(), version: z.number().int().positive() });
export type ProjectSpaceDTO = z.infer<typeof projectSpaceSchema>;
export const projectDirectorySchema = z.object({
  canManage: z.boolean(), spaces: z.array(projectSpaceSchema),
  projects: z.array(z.object({ id: z.uuid(), name: z.string(), description: z.string().nullable(), kind: z.enum(["course", "lab", "contest"]).nullable(), status: z.enum(["active", "archived"]), spaceId: z.uuid().nullable(), placementVersion: z.number().int().nonnegative(), total: z.number().int().nonnegative(), accepted: z.number().int().nonnegative() })),
});
export type ProjectDirectoryDTO = z.infer<typeof projectDirectorySchema>;
const name = z.string().trim().min(1, "请填写目录名称").max(80, "目录名称最多 80 字");
export const projectSpaceMutationSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("create"), name, parentId: z.uuid().nullable().default(null) }),
  z.object({ op: z.literal("update"), id: z.uuid(), version: z.number().int().positive(), name, parentId: z.uuid().nullable() }),
  z.object({ op: z.literal("delete"), id: z.uuid(), version: z.number().int().positive() }),
  z.object({ op: z.literal("place"), projectId: z.uuid(), version: z.number().int().nonnegative(), spaceId: z.uuid().nullable() }),
]);
export type ProjectSpaceMutation = z.input<typeof projectSpaceMutationSchema>;

export function projectSpacePath(spaces: ProjectSpaceDTO[], id: string | null): ProjectSpaceDTO[] {
  const path: ProjectSpaceDTO[] = [];
  const visited = new Set<string>();
  let current = id;
  while (current) {
    const row = spaces.find((space) => space.id === current);
    if (!row || visited.has(current)) return [];
    visited.add(current); path.unshift(row); current = row.parentId;
  }
  return path;
}

export function projectSpaceMoveError(spaces: ProjectSpaceDTO[], id: string | null, parentId: string | null): string | null {
  const parentPath = projectSpacePath(spaces, parentId);
  if (parentId && !parentPath.length) return "目标目录不存在或不属于当前团队";
  if (id && (id === parentId || parentPath.some((space) => space.id === id))) return "目录不能移动到自身或自己的子目录";
  const subtreeDepth = (root: string): number => {
    const children = spaces.filter((space) => space.parentId === root);
    return children.length ? 1 + Math.max(...children.map((child) => subtreeDepth(child.id))) : 1;
  };
  const height = id ? subtreeDepth(id) : 1;
  return parentPath.length + height > PROJECT_SPACE_DEPTH ? `目录最多 ${PROJECT_SPACE_DEPTH} 层，请选择较浅的目录` : null;
}
