"use client";

import { motion, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import * as React from "react";

import { Button } from "./button";

type MagneticButtonProps = React.ComponentProps<typeof Button> & {
  strength?: number;
  maxDistance?: number;
};

export function MagneticButton({
  children,
  disabled,
  strength = 0.2,
  maxDistance = 8,
  ...props
}: MagneticButtonProps) {
  const reducedMotion = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 420, damping: 32, mass: 0.5 });
  const springY = useSpring(y, { stiffness: 420, damping: 32, mass: 0.5 });

  const reset = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.div
      className="inline-flex"
      style={reducedMotion ? undefined : { x: springX, y: springY }}
      onPointerMove={(event) => {
        if (disabled || reducedMotion) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const offsetX = (event.clientX - (rect.left + rect.width / 2)) * strength;
        const offsetY = (event.clientY - (rect.top + rect.height / 2)) * strength;
        x.set(Math.max(-maxDistance, Math.min(maxDistance, offsetX)));
        y.set(Math.max(-maxDistance, Math.min(maxDistance, offsetY)));
      }}
      onPointerLeave={reset}
    >
      <Button disabled={disabled} {...props}>{children}</Button>
    </motion.div>
  );
}
