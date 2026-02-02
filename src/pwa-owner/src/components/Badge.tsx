type BadgeProps = {
  label: string;
  variant?: "pendente" | "aprovado" | "recusado" | "warning" | "info";
};

const Badge = ({ label, variant = "info" }: BadgeProps) => {
  const variantClass = `badge-${variant}`;
  return <span className={`badge ${variantClass}`}>{label}</span>;
};

export default Badge;
