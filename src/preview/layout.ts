/** Device pixel ratio above which extra pixels cost more than they show. */
export const MAX_DPR = 2;

/** What the drawing buffer is sized from: the frame as shown on the page. */
export interface PreviewLayout {
  /** The frame's displayed size in CSS pixels. */
  cssWidth: number;
  cssHeight: number;
  /** Device pixels per CSS pixel, capped at MAX_DPR. */
  dpr: number;
  /** Width / height of the picture itself. */
  aspect: number;
  /** The shape the frame is stretched to on screen, or null when it is shown as drawn. */
  displayAspect: number | null;
}

/** The CSS size of the frame, letterboxed inside the container: the export aspect, or the shape it is stretched to. */
export function fitFrame(
  containerWidth: number,
  containerHeight: number,
  aspect: number,
  displayAspect: number | null,
): { cssWidth: number; cssHeight: number } {
  const shown = displayAspect ?? aspect;
  const cssWidth = containerWidth / containerHeight > shown ? containerHeight * shown : containerWidth;
  return { cssWidth, cssHeight: cssWidth / shown };
}
