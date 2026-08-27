import { type DBSchema, type IDBPDatabase, openDB } from "idb";
import type { ImageItem } from "../model/image";
import type { PagePattern, PdfSource } from "../model/page";
import type { Stroke } from "../model/stroke";
import type { TextItem } from "../model/textItem";
import type { ViewState } from "../model/viewState";

export interface NotebookRecord {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  pageCount: number;
  viewState?: ViewState;
}

export interface PageRecord {
  id: string;
  notebookId: string;
  index: number;
  width?: number;
  height?: number;
  paperColor: string;
  pattern: PagePattern;
  strokes: Stroke[];
  images?: ImageItem[];
  texts?: TextItem[];
  pdfSource?: PdfSource;
}

export interface ImageRecord {
  id: string;
  mimeType: string;
  blob: Blob;
}

export interface PdfRecord {
  id: string;
  blob: Blob;
}

export interface GeometryRecord {
  id: string;
  document: string;
}

interface VasDB extends DBSchema {
  notebooks: { key: string; value: NotebookRecord };
  pages: { key: string; value: PageRecord; indexes: { "by-notebook": string } };
  images: { key: string; value: ImageRecord };
  pdfs: { key: string; value: PdfRecord };
  geometries: { key: string; value: GeometryRecord };
}

let dbPromise: Promise<IDBPDatabase<VasDB>> | null = null;

export function db(): Promise<IDBPDatabase<VasDB>> {
  dbPromise ??= openDB<VasDB>("vas", 4, {
    upgrade(database, oldVersion) {
      if (oldVersion < 1) {
        database.createObjectStore("notebooks", { keyPath: "id" });
        const pages = database.createObjectStore("pages", { keyPath: "id" });
        pages.createIndex("by-notebook", "notebookId");
      }
      if (oldVersion < 2) {
        database.createObjectStore("images", { keyPath: "id" });
      }
      if (oldVersion < 3) {
        database.createObjectStore("pdfs", { keyPath: "id" });
      }
      if (oldVersion < 4) {
        database.createObjectStore("geometries", { keyPath: "id" });
      }
    },
  });
  return dbPromise;
}
