import * as React from "react";
import { CheckCircle2, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import { BrandMascot } from "@/shared/components/common/BrandMascot";
import { cn } from "@/lib/utils";

interface OrderSuccessCelebrationProps {
  orderNumber: string;
  className?: string;
}

export function OrderSuccessCelebration({
  orderNumber,
  className,
}: OrderSuccessCelebrationProps) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const colors = ["#0E4825", "#FF6600", "#4ADE80", "#F59E0B", "#22C55E", "#EAB308"];
    const particles: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
      color: string;
      rotation: number;
      vRot: number;
      opacity: number;
    }> = [];

    // Generate 70 colorful confetti particles
    for (let i = 0; i < 70; i++) {
      particles.push({
        x: width * 0.5 + (Math.random() - 0.5) * 100,
        y: height * 0.25 + (Math.random() - 0.5) * 50,
        vx: (Math.random() - 0.5) * 12,
        vy: (Math.random() - 1.2) * 10,
        size: Math.random() * 8 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360,
        vRot: (Math.random() - 0.5) * 10,
        opacity: 1,
      });
    }

    let animationFrame: number;
    const startTime = Date.now();
    const duration = 2500; // 2.5s duration

    const render = () => {
      const elapsed = Date.now() - startTime;
      if (elapsed > duration) {
        ctx.clearRect(0, 0, width, height);
        return;
      }

      ctx.clearRect(0, 0, width, height);

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.25; // gravity
        p.rotation += p.vRot;
        p.opacity = Math.max(0, 1 - elapsed / duration);

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.opacity;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      }

      animationFrame = requestAnimationFrame(render);
    };

    animationFrame = requestAnimationFrame(render);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return (
    <div className={cn("relative flex flex-col items-center text-center select-none", className)}>
      <canvas
        ref={canvasRef}
        className="pointer-events-none fixed inset-0 z-50 h-full w-full"
        style={{ pointerEvents: "none" }}
      />

      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", damping: 20, stiffness: 200 }}
        className="relative flex flex-col items-center"
      >
        <BrandMascot size={110} float className="drop-shadow-[0_8px_20px_rgba(14,72,37,0.25)]" />
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: "spring", damping: 15 }}
          className="absolute -bottom-1 -right-1 grid h-9 w-9 place-items-center rounded-full bg-[#0E4825] text-white border-2 border-surface shadow-lg"
        >
          <CheckCircle2 className="h-6 w-6 text-[#4ADE80]" />
        </motion.div>
      </motion.div>

      <motion.div
        initial={{ y: 15, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.15, duration: 0.4 }}
        className="mt-4 space-y-1.5"
      >
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#0E4825]/10 border border-[#0E4825]/20 text-[#0E4825] dark:text-[#4ADE80] text-xs font-black uppercase tracking-wider">
          <Sparkles className="w-3.5 h-3.5 text-[#FF6600]" />
          <span>Order Placed Successfully!</span>
        </div>
        <h1 className="text-xl sm:text-2xl font-black text-text tracking-tight">
          Your Delicious Burgers Are In The Works!
        </h1>
        <p className="text-xs sm:text-sm text-text-secondary">
          Order ID: <span className="font-mono font-bold text-text">{orderNumber}</span> • We've transmitted your ticket directly to the kitchen POS.
        </p>
      </motion.div>
    </div>
  );
}

export default OrderSuccessCelebration;
