import React, { ReactNode, useState, useEffect } from "react";
import { motion, useReducedMotion } from "motion/react";

interface PageTransitionProps {
  children: ReactNode;
  className?: string;
  id?: string;
}

export function PageTransition({ children, className, id }: PageTransitionProps) {
  const [mounted, setMounted] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    setMounted(true);
  }, []);

  const hasReducedMotion = mounted ? shouldReduceMotion : false;

  if (hasReducedMotion) {
    return (
      <div id={id} className={className}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      id={id}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{
        duration: 0.22, // 220ms (subtle Android/iOS style)
        ease: [0.33, 1, 0.68, 1], // easeOutCubic
      }}
      className={className}
      style={{ willChange: "transform, opacity" }}
    >
      {children}
    </motion.div>
  );
}
