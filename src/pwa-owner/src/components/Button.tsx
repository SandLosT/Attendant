import type { ButtonHTMLAttributes } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger";
};

const Button = ({ variant = "primary", className = "", ...props }: ButtonProps) => {
  const variantClass =
    variant === "danger" ? "btn-danger" : variant === "ghost" ? "btn-ghost" : "btn-primary";

  return <button className={`btn ${variantClass} ${className}`} {...props} />;
};

export default Button;
