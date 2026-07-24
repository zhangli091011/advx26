"use client";

import * as THREE from "three";
import occtimportjs from "occt-import-js";

/**
 * STEP 文件 → 点云几何体
 * 用 OpenCascade (occt-import-js) 在浏览器端把 STEP 三角化为 mesh，
 * 再在三角形表面做面积加权采样，生成均匀点云。
 */

export interface PointCloudData {
  positions: Float32Array;
  count: number;
  center: THREE.Vector3;
  radius: number;
}

type Mesh = {
  attributes: { position: { array: ArrayLike<number> } };
  index?: { array: ArrayLike<number> };
};

let occtPromise: ReturnType<typeof occtimportjs> | undefined;

function getOcct() {
  if (!occtPromise) {
    occtPromise = occtimportjs({
      locateFile: (path) => path.endsWith(".wasm")
        ? new URL("/wasm/occt-import-js.wasm", window.location.origin).href
        : path,
    }).catch((error) => {
      occtPromise = undefined;
      throw error;
    });
  }
  return occtPromise;
}

function forEachTriangle(
  meshes: Mesh[],
  visit: (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, area: number) => void,
) {
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const cross = new THREE.Vector3();

  for (const mesh of meshes) {
    const positions = mesh.attributes.position.array;
    const indices = mesh.index?.array;
    const triangleCount = Math.floor(indices ? indices.length / 3 : positions.length / 9);
    for (let triangle = 0; triangle < triangleCount; triangle++) {
      const aIndex = indices ? indices[triangle * 3] * 3 : triangle * 9;
      const bIndex = indices ? indices[triangle * 3 + 1] * 3 : triangle * 9 + 3;
      const cIndex = indices ? indices[triangle * 3 + 2] * 3 : triangle * 9 + 6;
      a.set(positions[aIndex], positions[aIndex + 1], positions[aIndex + 2]);
      b.set(positions[bIndex], positions[bIndex + 1], positions[bIndex + 2]);
      c.set(positions[cIndex], positions[cIndex + 1], positions[cIndex + 2]);
      const area = cross.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a)).length() / 2;
      if (Number.isFinite(area) && area > 1e-8) visit(a, b, c, area);
    }
  }
}

export async function stepToPointCloud(
  file: File,
  targetPoints = 22000,
): Promise<PointCloudData> {
  if (file.size === 0) throw new Error("STEP 文件为空");
  if (file.size > 200 * 1024 * 1024) throw new Error("STEP 文件超过 200 MB，请先简化装配体");

  const buffer = await file.arrayBuffer();
  let result;
  try {
    const occt = await getOcct();
    result = occt.ReadStepFile(new Uint8Array(buffer), null);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`STEP 解析器加载失败：${message}`);
  }

  if (!result.success) {
    throw new Error("STEP 解析失败：文件格式不受支持或已损坏");
  }
  if (!result.meshes || result.meshes.length === 0) {
    throw new Error("STEP 已读取但无几何体（可能是空装配或仅含基准）");
  }

  let totalArea = 0;
  forEachTriangle(result.meshes, (_a, _b, _c, area) => { totalArea += area; });
  if (totalArea <= 0) throw new Error("未提取到有效三角形");

  // 预先生成面积阈值，再遍历一次三角形，确保复杂装配也严格限制粒子数。
  const pointCount = Math.max(1, Math.min(100_000, Math.round(targetPoints)));
  const thresholds = Array.from({ length: pointCount }, () => Math.random() * totalArea).sort((a, b) => a - b);
  const positions = new Float32Array(pointCount * 3);
  let thresholdIndex = 0;
  let cumulativeArea = 0;
  forEachTriangle(result.meshes, (a, b, c, area) => {
    cumulativeArea += area;
    while (thresholdIndex < pointCount && thresholds[thresholdIndex] <= cumulativeArea) {
      let u = Math.random();
      let v = Math.random();
      if (u + v > 1) { u = 1 - u; v = 1 - v; }
      const w = 1 - u - v;
      const offset = thresholdIndex * 3;
      positions[offset] = a.x * u + b.x * v + c.x * w;
      positions[offset + 1] = a.y * u + b.y * v + c.y * w;
      positions[offset + 2] = a.z * u + b.z * v + c.z * w;
      thresholdIndex += 1;
    }
  });

  // 居中 + 计算包围球
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.computeBoundingSphere();
  const sphere = geom.boundingSphere ?? new THREE.Sphere(new THREE.Vector3(), 1);
  const center = sphere.center.clone();
  const radius = sphere.radius || 1;
  geom.dispose();
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] -= center.x;
    positions[i + 1] -= center.y;
    positions[i + 2] -= center.z;
  }

  return { positions, count: positions.length / 3, center, radius };
}
