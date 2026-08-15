import { useBoardStore } from "../store/useBoardStore";

export function PageIndicator() {
  const index = useBoardStore((state) => state.viewPageIndex);
  const count = useBoardStore((state) => state.pages.length);
  return (
    <div className="page-indicator">
      {index + 1} / {count}
    </div>
  );
}
