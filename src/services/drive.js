
import { exec } from "@swytchcode/runtime";

const NOTES_FOLDER_ID = "1983XS_YusAnoo2PF2iZVNQQFeSSx_igu";

export async function listNotes() {
  const result = await exec("drive.file.list", {
    q: `'${NOTES_FOLDER_ID}' in parents and trashed = false`,
    pageSize: 100,
    orderBy: "modifiedTime desc",
  });

  return result;
}

export async function getNoteContent(fileId) {
  const result = await exec(
    "drive.file.get",
    { fileId, alt: "media" },
    { raw: true }
  );

  return result;
}
