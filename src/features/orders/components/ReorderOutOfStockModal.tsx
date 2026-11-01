import { AlertCircle } from "lucide-react";

interface ReorderOutOfStockModalProps {
  isOpen: boolean;
  unavailableItems: string[];
  onDismiss: () => void;
  onConfirmRemaining: () => void;
}

export function ReorderOutOfStockModal({
  isOpen,
  unavailableItems,
  onDismiss,
  onConfirmRemaining,
}: ReorderOutOfStockModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-surface border border-divider rounded-3xl w-full max-w-sm p-5 space-y-4 shadow-2xl">
        <div className="flex items-center gap-2 text-amber-500 dark:text-amber-400 font-black text-sm">
          <AlertCircle className="w-5 h-5" />
          <span>Some Items Unavailable</span>
        </div>

        <p className="text-xs text-text-secondary">
          The following item(s) are currently out of stock at this store:
        </p>

        <ul className="space-y-1 text-xs text-text list-disc list-inside bg-bg-secondary p-3 rounded-2xl border border-divider">
          {unavailableItems.map((item, i) => (
            <li key={i} className="font-bold">
              {item}
            </li>
          ))}
        </ul>

        <p className="text-xs text-text-secondary">
          Would you like to reorder the remaining available items?
        </p>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-divider">
          <button
            type="button"
            onClick={onDismiss}
            className="px-3 py-2 rounded-xl bg-bg-secondary border border-divider text-text font-bold text-xs hover:bg-surface cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirmRemaining}
            className="px-4 py-2 rounded-xl bg-accent text-white font-black text-xs uppercase tracking-wider shadow-md hover:bg-accent-hover"
          >
            Reorder Remaining
          </button>
        </div>
      </div>
    </div>
  );
}

export default ReorderOutOfStockModal;
