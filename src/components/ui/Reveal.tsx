import React from 'react';
import { motion, useReducedMotion, Variants } from 'motion/react';

interface RevealProps {
  children: React.ReactNode;
  className?: string;
  /** Délai avant l'apparition, en secondes */
  delay?: number;
  /** Décalage vertical initial, en pixels */
  y?: number;
}

/**
 * Révèle son contenu lors de l'entrée dans le viewport (une seule fois).
 * Repli sans animation si l'utilisateur préfère réduire les animations.
 */
export const Reveal: React.FC<RevealProps> = ({ children, className = '', delay = 0, y = 24 }) => {
  const prefersReduced = useReducedMotion();

  if (prefersReduced) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
};

/** Conteneur qui décale l'apparition de ses enfants (voir `staggerItem`). */
export const staggerContainer: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.08, delayChildren: 0.05 },
  },
};

/** Élément enfant à utiliser à l'intérieur d'un `staggerContainer`. */
export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  },
};
