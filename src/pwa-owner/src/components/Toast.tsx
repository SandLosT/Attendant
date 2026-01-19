type ToastProps = {
  message: string;
  variant?: "success" | "error";
  onClose: () => void;
};

const Toast = ({ message, variant = "success", onClose }: ToastProps) => {
  return (
    <div className={`toast toast-${variant}`} role="status">
      <span>{message}</span>
      <button type="button" className="toast-close" onClick={onClose}>
        ×
      </button>
    </div>
  );
};

export default Toast;
