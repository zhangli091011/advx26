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

function estimateSize(meshes: Array<{ attributes: { position: { array: ArrayLike<number> } } }>) {
  const box = new THREE.Box3();
  const point = new THREE.Vector3();
  for (const mesh of meshes) {
    const positions = mesh.attributes.position.array;
    for (let i = 0; i < positions.length; i += 3) {
      box.expandByPoint(point.set(positions[i], positions[i + 1], positions[i + 2]));
    }
  }
  return box.isEmpty() ? 0 : box.getSize(point).length();
}

/** 在三角形表面做面积加权均匀采样 */
function sampleTriangle(
  a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3,
  area: number, ptsPerUnit: number, out: number[],
) {
  const n = Math.max(1, Math.round(area * ptsPerUnit));
  for (let i = 0; i < n; i++) {
    // 均匀重心坐标
    let u = Math.random(), v = Math.random();
    if (u + v > 1) { u = 1 - u; v = 1 - v; }
    const w = 1 - u - v;
    out.push(
      a.x * u + b.x * v + c.x * w,
      a.y * u + b.y * v + c.y * w,
      a.z * u + b.z * v + c.z * w,
    );
  }
}

export async function stepToPointCloud(
  file: File,
  targetPoints = 22000,
): Promise<PointCloudData> {
  const buffer = await file.arrayBuffer();
  // 从 public/wasm/ 同源加载 WASM，避免 node_modules 路径 404
  const occt = await occtimportjs({
    locateFile: (path) => (path.endsWith(".wasm") ? "/wasm/occt-import-js.wasm" : path),
  });

  // 先按毫米解析；若包围盒异常大（>10m，说明是英寸/其他单位被误读），改用自适应单位重试
  let result = occt.ReadStepFile(new Uint8Array(buffer), null);
  if (result.success && result.meshes.length > 0) {
    const est = estimateSize(result.meshes);
    if (est > 10000) {
      // 尺寸离谱 → 可能是英寸模型按毫米读出，重新按英寸解析
      const retry = occt.ReadStepFile(new Uint8Array(buffer), { linearUnit: "inch" });
      if (retry.success) result = retry;
    }
  }

  if (!result.success) {
    throw new Error("STEP 解析失败：文件格式不受支持或已损坏");
  }
  if (!result.meshes || result.meshes.length === 0) {
    throw new Error("STEP 已读取但无几何体（可能是空装配或仅含基准）");
  }

  // 合并所有 mesh 的三角形
  const tris: THREE.Vector3[][] = [];
  let totalArea = 0;
  const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3();

  for (const mesh of result.meshes) {
    const pos = mesh.attributes.position.array as number[];
    const index = mesh.index?.array as number[] | undefined;
    const triCount = index ? index.length / 3 : pos.length / 9;
    for (let t = 0; t < triCount; t++) {
      const i0 = index ? index[t * 3] * 3 : t * 9;
      const i1 = index ? index[t * 3 + 1] * 3 : t * 9 + 3;
      const i2 = index ? index[t * 3 + 2] * 3 : t * 9 + 6;
      va.set(pos[i0], pos[i0 + 1], pos[i0 + 2]);
      vb.set(pos[i1], pos[i1 + 1], pos[i1 + 2]);
      vc.set(pos[i2], pos[i2 + 1], pos[i2 + 2]);
      ab.subVectors(vb, va);
      ac.subVectors(vc, va);
      const area = ab.clone().cross(ac).length() / 2;
      if (area < 1e-8) continue;
      totalArea += area;
      tris.push([va.clone(), vb.clone(), vc.clone(), area as unknown as THREE.Vector3] as THREE.Vector3[]);
    }
  }

  if (tris.length === 0) throw new Error("未提取到有效三角形");

  // 面积加权采样
  const ptsPerUnit = targetPoints / totalArea;
  const raw: number[] = [];
  for (const tri of tris) {
    sampleTriangle(tri[0], tri[1], tri[2], tri[3] as unknown as number, ptsPerUnit, raw);
  }

  const positions = new Float32Array(raw);
  // 居中 + 计算包围球
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.computeBoundingSphere();
  const sphere = geom.boundingSphere ?? new THREE.Sphere(new THREE.Vector3(), 1);
  const center = sphere.center.clone();
  const radius = sphere.radius || 1;
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] -= center.x;
    positions[i + 1] -= center.y;
    positions[i + 2] -= center.z;
  }

  return { positions, count: positions.length / 3, center, radius };
}

/** 用程序几何生成一个默认机器人底盘点云（未导入时展示） */
export function defaultRobotPointCloud(targetPoints = 18000): PointCloudData {
  const pts: number[] = [];
  // 底盘立方体框架 1.0 × 0.3 × 0.7
  const sampleBox = (cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, n: number) => {
    for (let i = 0; i < n; i++) {
      const face = Math.floor(Math.random() * 6);
      let x = (Math.random() - 0.5) * sx, y = (Math.random() - 0.5) * sy, z = (Math.random() - 0.5) * sz;
      if (face === 0) x = sx / 2; else if (face === 1) x = -sx / 2;
      else if (face === 2) y = sy / 2; else if (face === 3) y = -sy / 2;
      else if (face === 4) z = sz / 2; else z = -sz / 2;
      pts.push(cx + x, cy + y, cz + z);
    }
  };
  const sampleCylinder = (cx: number, cy: number, cz: number, r: number, h: number, n: number, axis: "x" | "z") => {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const rr = r * (0.85 + Math.random() * 0.15);
      const t = (Math.random() - 0.5) * h;
      if (axis === "x") pts.push(cx + t, cy + Math.cos(a) * rr, cz + Math.sin(a) * rr);
      else pts.push(cx + Math.cos(a) * rr, cy + t, cz + Math.sin(a) * rr);
    }
  };
  // 底盘
  sampleBox(0, 0.15, 0, 1.0, 0.3, 0.7, Math.round(targetPoints * 0.45));
  // 上层框架
  sampleBox(0, 0.45, -0.1, 0.7, 0.28, 0.45, Math.round(targetPoints * 0.2));
  // 四个轮子（横置圆柱）
  const wx = [-0.42, 0.42], wz = [-0.32, 0.32];
  for (const x of wx) for (const z of wz) {
    sampleCylinder(x, -0.05, z, 0.13, 0.06, Math.round(targetPoints * 0.04), "x");
  }
  // 射手塔
  sampleBox(0, 0.72, -0.18, 0.34, 0.26, 0.3, Math.round(targetPoints * 0.12));
  // 进气臂
  sampleBox(0, 0.32, 0.42, 0.6, 0.08, 0.2, Math.round(targetPoints * 0.07));

  const positions = new Float32Array(pts);
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.computeBoundingSphere();
  const sphere = geom.boundingSphere ?? new THREE.Sphere(new THREE.Vector3(), 1);
  const center = sphere.center.clone();
  const radius = sphere.radius || 1;
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] -= center.x; positions[i + 1] -= center.y; positions[i + 2] -= center.z;
  }
  return { positions, count: positions.length / 3, center, radius };
}
