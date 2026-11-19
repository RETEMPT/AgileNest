import { describe, expect, it } from "vitest";
import { projectSpaceMoveError, projectSpacePath, projectSpaceMutationSchema, type ProjectSpaceDTO } from "@/modules/identity/client";

const ids = Array.from({ length: 6 }, (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`);
const chain: ProjectSpaceDTO[] = ids.slice(0, 4).map((id, index) => ({ id, parentId: index ? ids[index - 1] : null, name: `目录${index}`, version: 1 }));
describe("项目目录纯契约", () => {
  it("生成从根到当前的面包屑", () => expect(projectSpacePath(chain, ids[2]).map((space) => space.id)).toEqual(ids.slice(0, 3)));
  it("缺失目录与根路径返回空路径", () => { expect(projectSpacePath(chain, null)).toEqual([]); expect(projectSpacePath(chain, ids[5])).toEqual([]); });
  it("拒绝自己和子目录作为父级", () => { expect(projectSpaceMoveError(chain, ids[0], ids[0])).toContain("自身"); expect(projectSpaceMoveError(chain, ids[0], ids[2])).toContain("子目录"); });
  it("新建不得超过四层", () => { expect(projectSpaceMoveError(chain, null, ids[2])).toBeNull(); expect(projectSpaceMoveError(chain, null, ids[3])).toContain("4"); });
  it("移动校验整个子树深度", () => { const spaces = [...chain, { id: ids[4], parentId: null, name: "独立", version: 1 }]; expect(projectSpaceMoveError(spaces, ids[0], ids[4])).toContain("4"); expect(projectSpaceMoveError(spaces, ids[2], ids[4])).toBeNull(); });
  it("其他范围父目录不可用", () => expect(projectSpaceMoveError(chain, null, ids[5])).toContain("不属于"));
  it("边界修剪名字并验证版本和UUID", () => { expect(projectSpaceMutationSchema.parse({ op: "create", name: "  研究  " })).toMatchObject({ name: "研究" }); expect(projectSpaceMutationSchema.safeParse({ op: "place", projectId: "bad", spaceId: null, version: 0 }).success).toBe(false); expect(projectSpaceMutationSchema.safeParse({ op: "delete", id: ids[0], version: 0 }).success).toBe(false); });
});
