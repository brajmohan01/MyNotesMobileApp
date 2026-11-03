
import express from "express";
import { listNotes, getNoteContent } from "../services/drive.js";

const router = express.Router();

// GET /api/notes
// GET /api/notes?search=project
router.get("/", async (req, res) => {
  try {
    const result = await listNotes();

    // Get files from Google Drive response
    const files = (result.data?.files ?? result.files ?? [])
      .filter(
        (file) =>
          file.mimeType !== "application/vnd.google-apps.folder"
      );

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
    const result = await getNoteContent(req.params.id);

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

    res.status(500).json({
      success: false,
      message: "Unable to retrieve note content",
    });
  }
});

export default router;
