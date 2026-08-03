import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import type { UiMessage } from "@/components/ChatPanel";
import type { TechDocument } from "@/lib/documents";

export type ProjectVersionRow = {
  id: number;
  name: string;
  product_name: string;
  messages_json: string;
  documents_json: string;
  created_at: string;
};

export type ProjectVersionSummary = {
  id: number;
  name: string;
  productName: string;
  createdAt: string;
  messageCount: number;
  readyDocs: number;
};

export type ProjectVersionDetail = ProjectVersionSummary & {
  messages: UiMessage[];
  documents: TechDocument[];
};

const DB_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "po-copilot.sqlite");

let dbSingleton: Database.Database | null = null;

function getDb(): Database.Database {
  if (dbSingleton) return dbSingleton;

  fs.mkdirSync(DB_DIR, { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS project_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      product_name TEXT NOT NULL DEFAULT 'Producto',
      messages_json TEXT NOT NULL,
      documents_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  dbSingleton = db;
  return db;
}

export function getDatabasePath(): string {
  return DB_PATH;
}

export function saveProjectVersion(input: {
  name?: string;
  productName: string;
  messages: UiMessage[];
  documents: TechDocument[];
}): ProjectVersionSummary {
  const db = getDb();
  const createdAt = new Date().toISOString();
  const name =
    input.name?.trim() ||
    `Versión ${createdAt.slice(0, 19).replace("T", " ")}`;

  const result = db
    .prepare(
      `INSERT INTO project_versions
        (name, product_name, messages_json, documents_json, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      name,
      input.productName.slice(0, 120),
      JSON.stringify(input.messages),
      JSON.stringify(input.documents),
      createdAt,
    );

  const id = Number(result.lastInsertRowid);
  const readyDocs = input.documents.filter((d) => d.status === "ready").length;

  return {
    id,
    name,
    productName: input.productName,
    createdAt,
    messageCount: input.messages.length,
    readyDocs,
  };
}

export function listProjectVersions(limit = 50): ProjectVersionSummary[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, name, product_name, messages_json, documents_json, created_at
       FROM project_versions
       ORDER BY id DESC
       LIMIT ?`,
    )
    .all(limit) as ProjectVersionRow[];

  return rows.map((row) => {
    let messageCount = 0;
    let readyDocs = 0;
    try {
      const messages = JSON.parse(row.messages_json) as unknown[];
      messageCount = Array.isArray(messages) ? messages.length : 0;
    } catch {
      messageCount = 0;
    }
    try {
      const docs = JSON.parse(row.documents_json) as TechDocument[];
      readyDocs = Array.isArray(docs)
        ? docs.filter((d) => d.status === "ready").length
        : 0;
    } catch {
      readyDocs = 0;
    }
    return {
      id: row.id,
      name: row.name,
      productName: row.product_name,
      createdAt: row.created_at,
      messageCount,
      readyDocs,
    };
  });
}

export function getProjectVersion(
  id: number,
): ProjectVersionDetail | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT id, name, product_name, messages_json, documents_json, created_at
       FROM project_versions WHERE id = ?`,
    )
    .get(id) as ProjectVersionRow | undefined;

  if (!row) return null;

  const messages = JSON.parse(row.messages_json) as UiMessage[];
  const documents = JSON.parse(row.documents_json) as TechDocument[];

  return {
    id: row.id,
    name: row.name,
    productName: row.product_name,
    createdAt: row.created_at,
    messageCount: messages.length,
    readyDocs: documents.filter((d) => d.status === "ready").length,
    messages,
    documents,
  };
}
