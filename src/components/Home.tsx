import { useCallback, useEffect, useRef, useState } from "react";
import type { NotebookRecord } from "../persistence/db";
import { importPdfFile } from "../persistence/importPdf";
import {
  createNotebook,
  deleteNotebook,
  listNotebooks,
  mergeNotebooks,
  renameNotebook,
} from "../persistence/notebooks";
import { downloadNotebook, importNotebookFile } from "../persistence/transfer";
import { formatRelativeTime } from "./formatTime";
import { ExportIcon, RenameIcon, TrashIcon } from "./icons";

interface HomeProps {
  onOpen: (id: string) => void;
}

export function Home({ onOpen }: HomeProps) {
  const [notebooks, setNotebooks] = useState<NotebookRecord[] | null>(null);
  const [pdfProgress, setPdfProgress] = useState<{ done: number; total: number } | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await listNotebooks();
      setNotebooks(list);
      setSelected((prev) => prev.filter((id) => list.some((n) => n.id === id)));
    } catch (error) {
      console.error("Failed to load notebooks", error);
      window.alert("Failed to load notebooks. Local storage may be unavailable.");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createAndOpen = async () => {
    try {
      const meta = await createNotebook(`Notebook ${(notebooks?.length ?? 0) + 1}`);
      onOpen(meta.id);
    } catch (error) {
      console.error("Failed to create notebook", error);
      window.alert("Failed to create a notebook.");
    }
  };

  const rename = async (notebook: NotebookRecord) => {
    const title = window.prompt("Notebook name", notebook.title)?.trim();
    if (!title || title === notebook.title) return;
    try {
      await renameNotebook(notebook.id, title);
      await refresh();
    } catch (error) {
      console.error("Failed to rename notebook", error);
      window.alert("Failed to rename the notebook.");
    }
  };

  const remove = async (notebook: NotebookRecord) => {
    if (!window.confirm(`Delete "${notebook.title}"? This cannot be undone.`)) return;
    try {
      await deleteNotebook(notebook.id);
      await refresh();
    } catch (error) {
      console.error("Failed to delete notebook", error);
      window.alert("Failed to delete the notebook.");
    }
  };

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      await importNotebookFile(file);
      await refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Import failed");
    }
  };

  const importPdf = async (file: File | undefined) => {
    if (!file) return;
    setPdfProgress({ done: 0, total: 0 });
    try {
      const id = await importPdfFile(file, (done, total) => setPdfProgress({ done, total }));
      await refresh();
      onOpen(id);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "PDF import failed");
    } finally {
      setPdfProgress(null);
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const merge = async () => {
    if (selected.length === 0) return;
    const first = notebooks?.find((n) => n.id === selected[0]);
    const fallback = selected.length === 1 && first ? `${first.title} copy` : "Merged notebook";
    const title = window.prompt("Name for the merged notebook", fallback)?.trim();
    if (!title) return;
    try {
      const id = await mergeNotebooks(selected, title);
      setSelected([]);
      await refresh();
      onOpen(id);
    } catch (error) {
      console.error("Merge failed", error);
      window.alert("Merge failed.");
    }
  };

  return (
    <div className="home">
      <header className="home-header">
        <h1>vas</h1>
        <div className="home-actions">
          <button type="button" className="primary" onClick={() => void createAndOpen()}>
            New notebook
          </button>
          <button type="button" onClick={() => fileInputRef.current?.click()}>
            Import
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.zip,application/json,application/zip"
            hidden
            onChange={(e) => {
              void importFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            disabled={pdfProgress !== null}
            onClick={() => pdfInputRef.current?.click()}
          >
            {pdfProgress
              ? pdfProgress.total > 0
                ? `Importing PDF… ${pdfProgress.done}/${pdfProgress.total}`
                : "Importing PDF…"
              : "Import PDF"}
          </button>
          <input
            ref={pdfInputRef}
            type="file"
            accept=".pdf,application/pdf"
            hidden
            onChange={(e) => {
              void importPdf(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            disabled={selected.length === 0}
            title="Merge selected notebooks"
            onClick={() => void merge()}
          >
            {selected.length > 0 ? `Merge (${selected.length})` : "Merge"}
          </button>
        </div>
      </header>
      {notebooks !== null && notebooks.length === 0 && (
        <p className="home-empty">No notebooks yet. Create one to start writing.</p>
      )}
      {notebooks !== null && notebooks.length > 0 && (
        <div className="notebook-grid">
          {notebooks.map((notebook) => (
            <div
              key={notebook.id}
              className={
                selected.includes(notebook.id) ? "notebook-card selected" : "notebook-card"
              }
            >
              <input
                type="checkbox"
                className="notebook-checkbox"
                checked={selected.includes(notebook.id)}
                onChange={() => toggleSelect(notebook.id)}
                aria-label={`Select ${notebook.title}`}
              />
              <button type="button" className="notebook-open" onClick={() => onOpen(notebook.id)}>
                <span className="notebook-title">{notebook.title}</span>
                <span className="notebook-meta">
                  {notebook.pageCount} {notebook.pageCount === 1 ? "page" : "pages"} ·{" "}
                  {formatRelativeTime(notebook.updatedAt)}
                </span>
              </button>
              <div className="notebook-actions">
                <button type="button" title="Rename" onClick={() => void rename(notebook)}>
                  <RenameIcon />
                </button>
                <button
                  type="button"
                  title="Export"
                  onClick={() => {
                    void downloadNotebook(notebook.id).catch((error: unknown) => {
                      console.error("Export failed", error);
                      window.alert("Export failed.");
                    });
                  }}
                >
                  <ExportIcon />
                </button>
                <button type="button" title="Delete" onClick={() => void remove(notebook)}>
                  <TrashIcon />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
