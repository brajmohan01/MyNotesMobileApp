
import express from "express";
import { isSwytchcodeError } from "@swytchcode/runtime";
import {
  getNoteContent,
  listNotes,
  MultipleNotesFoldersError,
  NotesFolderNotFoundError,
} from "../services/drive.js";

const router = express.Router();

function isDriveNotConnectedError(error) {
  if (
    isSwytchcodeError(error) &&
    error.details?.category === "tenant_not_connected"
  ) {
    return true;
  }

  return (
    error instanceof Error &&
    /"category"\s*:\s*"tenant_not_connected"/.test(error.message)
  );
}

// GET /api/notes
// GET /api/notes?search=project
router.get("/", async (req, res) => {
  try {
    const files = await listNotes(req.firebaseUser.uid);

    // Search notes by title
    const search = (req.query.search ?? "")
      .toString()
      .trim()
      .toLowerCase();

    const filteredFiles = files.filter((file) =>
      file.name.toLowerCase().includes(search)
    );

    res.json({
      success: true,
      count: filteredFiles.length,
      notes: filteredFiles.map((file) => ({
        id: file.id,
        title: file.name,
        mimeType: file.mimeType,
        modifiedTime: file.modifiedTime,
      })),
    });
  } catch (error) {
    console.error("List notes error:", error);

    if (isDriveNotConnectedError(error)) {
      return res.status(409).json({
        success: false,
        code: "drive_not_connected",
        message: "Connect your Google Drive to see your notes.",
      });
    }

    if (error instanceof NotesFolderNotFoundError) {
      return res.status(409).json({
        success: false,
        code: "notes_folder_not_found",
        message: error.message,
      });
    }

    if (error instanceof MultipleNotesFoldersError) {
      return res.status(409).json({
        success: false,
        code: "multiple_notes_folders",
        message: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: "Unable to retrieve notes",
    });
  }
});

// GET /api/notes/:id
// Retrieve individual note HTML content
router.get("/:id", async (req, res) => {
  try {
    const result = await getNoteContent(
      req.firebaseUser.uid,
      req.params.id
    );

    let response = result;

    // Swytchcode returns a JSON string for raw responses.
    if (typeof result === "string") {
      response = JSON.parse(result);
    }

    if (response.status_code !== 200) {
      throw new Error("Google Drive returned an unsuccessful response");
    }

    res.json({
      success: true,
      id: req.params.id,
      content: response.body ?? "",
      contentType:
        response.headers?.["Content-Type"]?.[0] ?? "text/html",
    });
  } catch (error) {
    console.error("Read note error:", error);

    if (isDriveNotConnectedError(error)) {
      return res.status(409).json({
        success: false,
        code: "drive_not_connected",
        message: "Connect your Google Drive to see your notes.",
      });
    }

    if (error instanceof NotesFolderNotFoundError) {
      return res.status(409).json({
        success: false,
        code: "notes_folder_not_found",
        message: error.message,
      });
    }

    if (error instanceof MultipleNotesFoldersError) {
      return res.status(409).json({
        success: false,
        code: "multiple_notes_folders",
        message: error.message,
      });
    }

    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "note_not_found"
    ) {
      return res.status(404).json({
        success: false,
        code: error.code,
        message: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: "Unable to retrieve note content",
    });
  }
});

export default router;
