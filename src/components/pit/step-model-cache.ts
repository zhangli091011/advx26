import * as THREE from "three";
import type { PointCloudData } from "./step-points";

const DATABASE_NAME = "pit-os-models";
const STORE_NAME = "models";
const DEFAULT_MODEL_KEY = "default-step-model";
const CACHE_VERSION = 1;

type CachedStepModel = {
  key: string;
  version: number;
  fileName: string;
  savedAt: number;
  positions: ArrayBuffer;
  count: number;
  center: [number, number, number];
  radius: number;
  source?: ArrayBuffer;
  sourceType?: string;
  sourceLastModified?: number;
};

export type DefaultStepModel = {
  fileName: string;
  savedAt: number;
  cloud: PointCloudData;
  sourceFile: File | null;
};

export async function loadDefaultStepModel(): Promise<DefaultStepModel | null> {
  const database = await openDatabase();
  const record = await request<CachedStepModel | undefined>(
    database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(DEFAULT_MODEL_KEY),
  );
  database.close();
  if (!record || record.version !== CACHE_VERSION) return null;

  const positions = new Float32Array(record.positions);
  if (positions.length !== record.count * 3 || !Number.isFinite(record.radius) || record.radius <= 0) return null;
  return {
    fileName: record.fileName,
    savedAt: record.savedAt,
    sourceFile: record.source
      ? new File([record.source], record.fileName, {
          type: record.sourceType,
          lastModified: record.sourceLastModified,
        })
      : null,
    cloud: {
      positions,
      count: record.count,
      center: new THREE.Vector3(...record.center),
      radius: record.radius,
    },
  };
}

export async function saveDefaultStepModel(fileName: string, cloud: PointCloudData, sourceFile: File) {
  const database = await openDatabase();
  const positions = cloud.positions.slice();
  const source = await sourceFile.arrayBuffer();
  const record: CachedStepModel = {
    key: DEFAULT_MODEL_KEY,
    version: CACHE_VERSION,
    fileName,
    savedAt: Date.now(),
    positions: positions.buffer,
    count: cloud.count,
    center: cloud.center.toArray(),
    radius: cloud.radius,
    source,
    sourceType: sourceFile.type,
    sourceLastModified: sourceFile.lastModified,
  };
  await transactionComplete(database.transaction(STORE_NAME, "readwrite"), (store) => store.put(record));
  database.close();
}

export async function clearDefaultStepModel() {
  const database = await openDatabase();
  await transactionComplete(database.transaction(STORE_NAME, "readwrite"), (store) => store.delete(DEFAULT_MODEL_KEY));
  database.close();
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const open = indexedDB.open(DATABASE_NAME, 1);
    open.onupgradeneeded = () => {
      if (!open.result.objectStoreNames.contains(STORE_NAME)) open.result.createObjectStore(STORE_NAME, { keyPath: "key" });
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error ?? new Error("模型缓存数据库打开失败"));
  });
}

function request<T>(operation: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    operation.onsuccess = () => resolve(operation.result);
    operation.onerror = () => reject(operation.error ?? new Error("模型缓存读取失败"));
  });
}

function transactionComplete(transaction: IDBTransaction, mutate: (store: IDBObjectStore) => void) {
  return new Promise<void>((resolve, reject) => {
    mutate(transaction.objectStore(STORE_NAME));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("模型缓存写入失败"));
    transaction.onabort = () => reject(transaction.error ?? new Error("模型缓存写入已取消"));
  });
}
