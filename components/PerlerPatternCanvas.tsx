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
  onClick?: React.MouseEventHandler<HTMLCanvasElement>;
  onPointerDown?: React.PointerEventHandler<HTMLCanvasElement>;
  onPointerMove?: React.PointerEventHandler<HTMLCanvasElement>;
  onPointerUp?: React.PointerEventHandler<HTMLCanvasElement>;
  onPointerLeave?: React.PointerEventHandler<HTMLCanvasElement>;
}

const PerlerPatternCanvas: React.FC<PerlerPatternCanvasProps> = ({
  pattern,
  canvasRef,
  className,
  onClick,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerLeave,
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
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerLeave}
      className={className ?? 'block max-w-full h-auto rounded-xl bg-white shadow-xl'}
    />
  );
};

export default PerlerPatternCanvas;
