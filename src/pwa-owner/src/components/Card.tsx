import type { PropsWithChildren } from "react";

type CardProps = PropsWithChildren<{ className?: string }>;

const Card = ({ children, className = "" }: CardProps) => {
  return <div className={`card ${className}`}>{children}</div>;
};

export default Card;
