type ToastProps = {
  message: string;
  variant?: "success" | "error";
  onClose: () => void;
};

const Toast = ({ message, variant, onClose }: ToastProps) => {
  return (
    <div className={`toast ${variant === "error" ? "toast-error" : ""}`}>
      <span>{message}</span>
      <button type="button" className="btn btn-ghost" onClick={onClose}>
        ✕
      </button>
    </div>
  );
};

export default Toast;
