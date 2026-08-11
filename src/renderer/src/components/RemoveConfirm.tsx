import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useApp } from '../store'

export default function RemoveConfirm(): React.JSX.Element | null {
  const { removeTarget, closeRemove, jobs, clearSelection } = useApp()
  const [deleteFiles, setDeleteFiles] = useState(false)
  if (!removeTarget) return null

  const targets = jobs.filter((j) => removeTarget.includes(j.id))
  const withFiles = targets.filter((j) => j.outputFile).length

  const confirm = async (): Promise<void> => {
    await window.api.removeJobs(removeTarget, deleteFiles)
    clearSelection()
    closeRemove()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={closeRemove}>
      <div
        className="flex max-h-full w-[420px] max-w-full flex-col rounded-xl border border-line bg-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <Trash2 size={15} className="text-brand" />
          <span className="font-display text-[14px] font-semibold text-fg">
            Remove {targets.length === 1 ? 'download' : `${targets.length} downloads`}
          </span>
        </div>

        <div className="space-y-3 p-4">
          <div className="max-h-28 overflow-auto text-xs leading-5 text-muted">
            {targets.slice(0, 6).map((j) => (
              <div key={j.id} className="truncate">
                {j.title}
              </div>
            ))}
            {targets.length > 6 ? <div className="text-faint">…and {targets.length - 6} more</div> : null}
          </div>

          <label
            className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs ${
              withFiles > 0
                ? 'cursor-pointer border-line text-fg'
                : 'cursor-default border-line/50 text-faint'
            }`}
          >
            <input
              type="checkbox"
              disabled={withFiles === 0}
              checked={deleteFiles && withFiles > 0}
              onChange={(e) => setDeleteFiles(e.target.checked)}
              className="accent-[var(--t-brand)]"
            />
            Also move {withFiles === 1 ? 'the file' : 'files'} to the Recycle Bin
            {withFiles === 0 ? ' (no files on disk yet)' : ''}
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t border-line px-4 py-3">
          <button
            onClick={closeRemove}
            className="rounded-md border border-line px-3.5 py-1.5 text-xs font-medium text-muted hover:bg-raised hover:text-fg"
          >
            Cancel
          </button>
          <button
            onClick={() => void confirm()}
            className="rounded-md bg-brand px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-hi"
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  )
}
