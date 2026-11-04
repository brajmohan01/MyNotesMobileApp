
import { exec } from "@swytchcode/runtime";

const NOTES_FOLDER_NAME = "My Notes";

export class NotesFolderNotFoundError extends Error {}

export class MultipleNotesFoldersError extends Error {}

function getFiles(result) {
  const files = result?.data?.files ?? result?.files;
  if (!Array.isArray(files)) {
    throw new Error("Google Drive returned an invalid file list.");
  }
  return files;
}

async function listFiles(tenantId, query, options = {}) {
  const files = [];
  let pageToken;

  do {
    const result = await exec(
      "drive.file.list",
      {
        q: query,
        pageSize: 100,
        ...options,
        ...(pageToken ? { pageToken } : {}),
      },
      { tenantId }
    );

    files.push(...getFiles(result));
    pageToken = result?.data?.nextPageToken ?? result?.nextPageToken;
    if (pageToken != null && typeof pageToken !== "string") {
      throw new Error("Google Drive returned an invalid page token.");
    }
  } while (pageToken);

  return files;
}

async function findNotesFolder(tenantId) {
  const folders = (await listFiles(
    tenantId,
    `name = '${NOTES_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
  )).filter(
    (file) =>
      file.name === NOTES_FOLDER_NAME &&
      file.mimeType === "application/vnd.google-apps.folder"
  );

  if (folders.length === 0) {
    throw new NotesFolderNotFoundError(
      `Create a "${NOTES_FOLDER_NAME}" folder in your Google Drive and add your notes.`
    );
  }

  if (folders.length > 1) {
    throw new MultipleNotesFoldersError(
      `More than one "${NOTES_FOLDER_NAME}" folder was found. Keep one folder with that name.`
    );
  }

  return folders[0];
}

async function listFolderFiles(tenantId, folderId) {
  const files = await listFiles(
    tenantId,
    `'${folderId}' in parents and trashed = false`,
    { orderBy: "modifiedTime desc" }
  );
  return files.filter(
    (file) => file.mimeType !== "application/vnd.google-apps.folder"
  );
}

export async function listNotes(tenantId) {
  const folder = await findNotesFolder(tenantId);
  return listFolderFiles(tenantId, folder.id);
}

export async function getNoteContent(tenantId, fileId) {
  const folder = await findNotesFolder(tenantId);
  const files = await listFolderFiles(tenantId, folder.id);

  if (!files.some((file) => file.id === fileId)) {
    const error = new Error("Note not found in your My Notes folder.");
    error.code = "note_not_found";
    throw error;
  }

  const result = await exec(
    "drive.file.get",
    { fileId, alt: "media" },
    { raw: true, tenantId }
  );

  return result;
}
