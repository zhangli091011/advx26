"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { PointCloudData } from "./step-points";

/**
 * 终末地风格粒子 3D：
 * - 点云模型（黄色粒子 + 尺寸衰减 + 呼吸发光）
 * - 粒子从散开状态聚合成型（导入时的 assemble 动画）
 * - 旋转基座 + 扫描环 + 参考网格
 * - 缓慢自转 + 鼠标视差
 */

const vertexShader = /* glsl */ `
  attribute float aRandom;
  attribute vec3 aScatter;
  uniform float uTime;
  uniform float uAssemble;   // 0 → 1 聚合进度
  uniform float uSize;
  uniform float uPixelRatio;
  varying float vAlpha;
  varying float vRandom;

  void main() {
    vRandom = aRandom;
    // 聚合插值：散开位置 → 目标位置（带个体延迟的 easeOutCubic）
    float delay = aRandom * 0.5;
    float t = clamp((uAssemble - delay) / (1.0 - delay), 0.0, 1.0);
    t = 1.0 - pow(1.0 - t, 3.0);
    vec3 pos = mix(aScatter, position, t);

    // 呼吸浮动
    pos.y += sin(uTime * 1.4 + aRandom * 6.2831) * 0.010 * t;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;

    // 尺寸衰减 + 少量随机大小
    float size = uSize * (0.6 + aRandom * 0.6) * uPixelRatio;
    gl_PointSize = size * (1.0 / -mv.z);

    vAlpha = 0.9;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uColorHot;
  uniform float uTime;
  varying float vAlpha;
  varying float vRandom;

  void main() {
    // 圆形软点
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;
    // 锐化边缘，减少 glow 面积让点云更清晰
    float glow = smoothstep(0.5, 0.15, d);

    // 少量高亮"火花"粒子
    float hot = step(0.92, vRandom);
    vec3 col = mix(uColor, uColorHot, hot);

    // 微闪烁
    float flicker = 0.85 + 0.15 * sin(uTime * 2.0 + vRandom * 40.0);
    gl_FragColor = vec4(col, glow * vAlpha * flicker);
  }
`;

function ParticleModel({ data, assemble }: { data: PointCloudData; assemble: number }) {
  const pointsRef = useRef<THREE.Points>(null);
  const groupRef = useRef<THREE.Group>(null);
  const assembleRef = useRef({ value: 0 });
  assembleRef.current.value = assemble;

  const { geometry, uniforms } = useMemo(() => {
    const count = data.count;
    const scatter = new Float32Array(count * 3);
    const random = new Float32Array(count);
    const r = data.radius * 2.2;
    for (let i = 0; i < count; i++) {
      // 随机散开位置（球壳分布）
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const rr = r * (0.9 + Math.random() * 0.8);
      scatter[i * 3] = rr * Math.sin(phi) * Math.cos(theta);
      scatter[i * 3 + 1] = rr * Math.cos(phi);
      scatter[i * 3 + 2] = rr * Math.sin(phi) * Math.sin(theta);
      random[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(data.positions, 3));
    g.setAttribute("aScatter", new THREE.BufferAttribute(scatter, 3));
    g.setAttribute("aRandom", new THREE.BufferAttribute(random, 1));

    const u = {
      uTime: { value: 0 },
      uAssemble: { value: assemble },
      uSize: { value: 9 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      uColor: { value: new THREE.Color("#ffc700") },
      uColorHot: { value: new THREE.Color("#fff6d0") },
    };
    return { geometry: g, uniforms: u };
  }, [data]);

  useFrame((state, delta) => {
    uniforms.uTime.value = state.clock.elapsedTime;
    // 平滑逼近目标聚合度（较快，1.5s 内成型）
    uniforms.uAssemble.value = THREE.MathUtils.damp(
      uniforms.uAssemble.value,
      assembleRef.current.value,
      4.5,
      delta,
    );
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.22;
      // 鼠标视差
      const mx = state.pointer.x, my = state.pointer.y;
      groupRef.current.rotation.x = THREE.MathUtils.damp(groupRef.current.rotation.x, my * 0.15, 3, delta);
      groupRef.current.rotation.z = THREE.MathUtils.damp(groupRef.current.rotation.z, -mx * 0.05, 3, delta);
    }
  });

  const scale = 1.6 / data.radius;
  return (
    <group ref={groupRef} scale={[scale, scale, scale]}>
      <points ref={pointsRef} geometry={geometry}>
        <shaderMaterial
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </group>
  );
}

function ScanRing({ radius }: { radius: number }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (ref.current) {
      ref.current.rotation.z = state.clock.elapsedTime * 0.4;
      const m = ref.current.material as THREE.MeshBasicMaterial;
      m.opacity = 0.35 + 0.15 * Math.sin(state.clock.elapsedTime * 2);
    }
  });
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.72, 0]}>
      <ringGeometry args={[radius * 0.92, radius, 64, 1, 0, Math.PI * 1.5]} />
      <meshBasicMaterial color="#ffc700" transparent opacity={0.4} side={THREE.DoubleSide} />
    </mesh>
  );
}

function BaseGrid() {
  return (
    <>
      <gridHelper args={[4, 24, "#383b40", "#232629"]} position={[0, -0.75, 0]} />
      <ScanRing radius={1.05} />
      {/* 基座外圈 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.74, 0]}>
        <ringGeometry args={[1.18, 1.2, 64]} />
        <meshBasicMaterial color="#ffc700" transparent opacity={0.25} side={THREE.DoubleSide} />
      </mesh>
    </>
  );
}

export default function ParticleScene({
  data,
  assemble = 1,
}: {
  data: PointCloudData;
  assemble?: number;
}) {
  return (
    <Canvas
      camera={{ position: [0, 0.6, 2.6], fov: 42 }}
      gl={{ antialias: true, alpha: true }}
      style={{ background: "transparent" }}
    >
      <ParticleModel data={data} assemble={assemble} />
      <BaseGrid />
    </Canvas>
  );
}
