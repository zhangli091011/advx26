export const PIT_DESIGN_WIDTH = 1920;
export const PIT_DESIGN_HEIGHT = 1080;

export type PitViewportLayout = {
  scale: number;
  frameWidth: number;
  frameHeight: number;
  scrollable: boolean;
};

/**
 * Keep the complete 16:9 control surface visible whenever it remains readable.
 * Narrow or short windows switch to a scrollable canvas instead of shrinking
 * controls below a practical size.
 */
export function calculatePitViewport(
  width: number,
  height: number,
): PitViewportLayout {
  if (width <= 0 || height <= 0) {
    return { scale: 0, frameWidth: 0, frameHeight: 0, scrollable: false };
  }

  const fitScale = Math.min(
    width / PIT_DESIGN_WIDTH,
    height / PIT_DESIGN_HEIGHT,
  );
  const minimumReadableScale = width < 600 ? 0.72 : width < 1100 ? 0.64 : 0.6;
  const scale = Math.max(fitScale, minimumReadableScale);
  const frameWidth = roundLayoutPixel(PIT_DESIGN_WIDTH * scale);
  const frameHeight = roundLayoutPixel(PIT_DESIGN_HEIGHT * scale);

  return {
    scale,
    frameWidth,
    frameHeight,
    scrollable: frameWidth > width + 1 || frameHeight > height + 1,
  };
}

function roundLayoutPixel(value: number) {
  return Math.round(value * 1000) / 1000;
}
