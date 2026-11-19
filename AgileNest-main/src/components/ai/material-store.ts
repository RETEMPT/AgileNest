import { materialRefSchema, type LocalMaterial } from "./materials";

const DATABASE = "agilenest-ai-materials-v1";
const OBJECTS = "materials";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(OBJECTS, {keyPath:["userId", "id"]});
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("浏览器资料存储不可用，请允许本地存储后重试"));
    request.onblocked = () => reject(new Error("资料存储正在升级，请关闭其他 AgileNest 标签后重试"));
  });
}
export async function putMaterials(userId: string, materials: LocalMaterial[]) {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve,reject) => {
      const transaction = db.transaction(OBJECTS,"readwrite");
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(new Error("资料未保存，浏览器存储不可用或已满。请选择文件重试"));
      try {for (const material of materials) transaction.objectStore(OBJECTS).put({userId,id:material.ref.id,...material});}
      catch {transaction.abort();reject(new Error("资料未保存，浏览器存储不可用或已满。请选择文件重试"));}
    });
  } finally { db.close(); }
}
export async function getMaterial(userId: string, id: string): Promise<LocalMaterial> {
  const db = await openDatabase();
  try {
    return await new Promise((resolve,reject) => {
      const request = db.transaction(OBJECTS,"readonly").objectStore(OBJECTS).get([userId,id]);
      request.onerror = () => reject(new Error("资料读取失败，请重试"));
      request.onsuccess = () => {
        const value: unknown = request.result;
        if (!value || typeof value !== "object" || !("ref" in value) || !("blob" in value) || !(value.blob instanceof Blob)) { reject(new Error("本地资料已丢失，请重新添加文件")); return; }
        const ref = materialRefSchema.safeParse(value.ref);
        if (!ref.success || ref.data.id !== id || (ref.data.kind === "text" && (!("text" in value) || typeof value.text !== "string"))) { reject(new Error("本地资料无法读取，原数据未覆盖")); return; }
        resolve({ref:ref.data,blob:value.blob,text:"text" in value && typeof value.text === "string" ? value.text : undefined});
      };
    });
  } finally { db.close(); }
}
export async function deleteMaterials(userId: string, ids: string[]) {
  if (!ids.length) return;
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve,reject) => {
      const transaction = db.transaction(OBJECTS,"readwrite");
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(new Error("资料文件清理失败，请重试"));
      for (const id of ids) transaction.objectStore(OBJECTS).delete([userId,id]);
    });
  } finally { db.close(); }
}
