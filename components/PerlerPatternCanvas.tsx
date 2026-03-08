import React, { useEffect } from 'react';
import {
  DrawPerlerPatternOptions,
  drawPerlerPatternCanvas,
  PerlerPatternResult,
} from '../services/perlerPattern';

interface PerlerPatternCanvasProps extends DrawPerlerPatternOptions {
  pattern: PerlerPatternResult | null;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  className?: string;
}

const PerlerPatternCanvas: React.FC<PerlerPatternCanvasProps> = ({
  pattern,
  canvasRef,
  className,
  ...drawOptions
}) => {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    if (!pattern) {
      const context = canvas.getContext('2d');
      if (context) {
        context.clearRect(0, 0, canvas.width, canvas.height);
      }
      return;
    }

    drawPerlerPatternCanvas(canvas, pattern, drawOptions);
  }, [canvasRef, drawOptions, pattern]);

  return (
    <canvas
      ref={canvasRef}
      className={className ?? 'block max-w-full h-auto rounded-xl bg-white shadow-xl'}
    />
  );
};

export default PerlerPatternCanvas;
