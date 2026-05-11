'use client';
import { useEffect, useRef } from 'react';

const waves = [
  { amp: 0.10, freq: 1.6, speed: 0.018, phase: 0,   yBase: 0.30, color: [110, 25, 200] as [number,number,number], alpha: 0.30 },
  { amp: 0.08, freq: 2.0, speed: 0.014, phase: 1.2, yBase: 0.40, color: [150, 45, 220] as [number,number,number], alpha: 0.25 },
  { amp: 0.12, freq: 1.3, speed: 0.011, phase: 2.4, yBase: 0.50, color: [212,175,  55] as [number,number,number], alpha: 0.20 },
  { amp: 0.07, freq: 2.4, speed: 0.016, phase: 0.8, yBase: 0.58, color: [190,145,  40] as [number,number,number], alpha: 0.18 },
  { amp: 0.10, freq: 1.1, speed: 0.010, phase: 3.0, yBase: 0.66, color: [ 90, 15, 190] as [number,number,number], alpha: 0.28 },
  { amp: 0.06, freq: 2.8, speed: 0.019, phase: 1.9, yBase: 0.74, color: [220,180,  55] as [number,number,number], alpha: 0.15 },
  { amp: 0.09, freq: 1.8, speed: 0.013, phase: 4.0, yBase: 0.82, color: [130, 35, 215] as [number,number,number], alpha: 0.22 },
];

export default function WaveBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let t = 0;

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const draw = () => {
      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#080612';
      ctx.fillRect(0, 0, W, H);

      waves.forEach(w => {
        ctx.beginPath();
        const yBase = w.yBase * H;

        for (let x = 0; x <= W; x += 3) {
          const xr = x / W;
          const y =
            yBase +
            Math.sin(xr * Math.PI * 2 * w.freq + t * w.speed * 100 + w.phase) * w.amp * H +
            Math.sin(xr * Math.PI * 2 * w.freq * 0.6 + t * w.speed * 55 + w.phase * 1.2) * w.amp * H * 0.35;
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }

        ctx.lineTo(W, H);
        ctx.lineTo(0, H);
        ctx.closePath();

        const [r, g, b] = w.color;
        const grad = ctx.createLinearGradient(
          0, (w.yBase - w.amp) * H,
          0, (w.yBase + w.amp) * H + 80
        );
        grad.addColorStop(0, `rgba(${r},${g},${b},${w.alpha})`);
        grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.fillStyle = grad;
        ctx.globalCompositeOperation = 'screen';
        ctx.fill();
      });

      ctx.globalCompositeOperation = 'source-over';
      t += 0.022;
      animId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        filter: 'blur(18px) brightness(0.85)',
        transform: 'scale(1.05)',
      }}
    />
  );
}
