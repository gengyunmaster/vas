import { useToastStore } from "../store/toasts";

export function Toasts() {
  const toasts = useToastStore((state) => state.toasts);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={t.leaving ? "toast leaving" : "toast"}>
          {t.message}
        </div>
      ))}
    </div>
  );
}
