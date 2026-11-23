import { beforeEach, describe, expect, it } from "vitest";
import { AppError, ForbiddenError, NotFoundError } from "@/modules/core";
import { deletePublicFile, getPublicFile, listPublicFiles, uploadPublicFile } from "@/modules/public-files";
import { publicFileSchema } from "@/modules/public-files/client";
import { makeFixture, resetDb } from "../../helpers";

beforeEach(resetDb);

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

describe("公共文件库", () => {
  it("DTO 校验生效", () => {
    expect(publicFileSchema.safeParse({ id: crypto.randomUUID(), size: -1 }).success).toBe(false);
    expect(publicFileSchema.parse({ id: crypto.randomUUID(), fileName: "a.pdf", mimeType: "application/pdf", size: 1, uploadedById: null, uploaderName: null, createdAt: new Date().toISOString(), canDelete: false }).fileName).toBe("a.pdf");
  });

  it("登录用户均可上传、查看与下载，仅上传者可删除", async () => {
    const f = await makeFixture();
    const uploaded = await uploadPublicFile(f.student.id, { name: "diagram.png", bytes: PNG_BYTES });
    expect(uploaded).toMatchObject({ fileName: "diagram.png", mimeType: "image/png", size: 12, canDelete: true });

    const listed = await listPublicFiles(f.outsider.id);
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ fileName: "diagram.png", canDelete: false });

    const got = await getPublicFile(f.outsider.id, uploaded.id);
    expect(got.bytes.length).toBe(12);
    expect(got.file.fileName).toBe("diagram.png");

    await expect(deletePublicFile(f.outsider.id, uploaded.id)).rejects.toBeInstanceOf(ForbiddenError);
    await deletePublicFile(f.student.id, uploaded.id);
    expect(await listPublicFiles(f.outsider.id)).toEqual([]);
    await expect(getPublicFile(f.student.id, uploaded.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("拒绝不支持的格式与内容损坏的文件", async () => {
    const f = await makeFixture();
    await expect(uploadPublicFile(f.student.id, { name: "evil.exe", bytes: new Uint8Array([1, 2, 3]) })).rejects.toBeInstanceOf(AppError);
    await expect(uploadPublicFile(f.student.id, { name: "fake.pdf", bytes: new Uint8Array([0x41, 0x42, 0x43]) })).rejects.toBeInstanceOf(AppError);
  });
});
