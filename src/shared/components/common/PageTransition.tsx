import { type ReactNode } from "react";

interface PageTransitionProps {
  children: ReactNode;
  className?: string;
  id?: string;
}

/**
 * PageTransition — container passthrough now that native horizontal
 * slide-in/pop transitions are orchestrated at the layout level via ConsumerRouteTransition.
 */
export function PageTransition({ children, className, id }: PageTransitionProps) {
  return (
    <div id={id} className={className}>
      {children}
    </div>
  );
}
