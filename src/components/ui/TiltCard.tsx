import React, { useRef } from 'react';
import { motion, useMotionValue, useSpring, useTransform, useReducedMotion } from 'motion/react';

interface TiltCardProps {
  children: React.ReactNode;
  className?: string;
  /** Inclinaison maximale en degrés (effet 3D) */
  maxTilt?: number;
  /** Élévation au survol, en pixels */
  lift?: number;
}

/**
 * Carte à inclinaison 3D : suit le pointeur avec des ressorts.
 * Désactivée automatiquement si l'utilisateur préfère réduire les animations.
 */
export const TiltCard: React.FC<TiltCardProps> = ({
  children,
  className = '',
  maxTilt = 7,
  lift = 10,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const prefersReduced = useReducedMotion();

  const x = useMotionValue(0.5);
  const y = useMotionValue(0.5);

  const spring = { stiffness: 220, damping: 20, mass: 0.6 };
  const rotateX = useSpring(useTransform(y, [0, 1], [maxTilt, -maxTilt]), spring);
  const rotateY = useSpring(useTransform(x, [0, 1], [-maxTilt, maxTilt]), spring);

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (prefersReduced || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    x.set((event.clientX - rect.left) / rect.width);
    y.set((event.clientY - rect.top) / rect.height);
  };

  const reset = () => {
    x.set(0.5);
    y.set(0.5);
  };

  return (
    <motion.div
      ref={ref}
      onPointerMove={handlePointerMove}
      onPointerLeave={reset}
      style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}
      whileHover={prefersReduced ? undefined : { scale: 1.015, translateZ: lift }}
      transition={{ type: 'spring', stiffness: 260, damping: 24 }}
      className={className}
    >
      {children}
    </motion.div>
  );
};
