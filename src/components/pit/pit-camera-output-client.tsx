"use client";

import { CameraPlayer } from "@/components/pit/pit-cameras-client";
import { usePitState } from "@/components/pit/use-pit-state";

export function PitCameraOutputClient() {
  const { state } = usePitState();
  const source = state?.cameras.sources.find((item) => item.id === state.cameras.selectedSourceId);
  return <main className="pit-camera-output">{source?.online ? <CameraPlayer sourceId={source.id} /> : <div><span>PROGRAM OFFLINE</span><strong>{source?.label ?? "NO SOURCE SELECTED"}</strong></div>}</main>;
}
