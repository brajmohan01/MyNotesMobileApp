
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import driveRouter from "./routes/drive.js";
import notesRouter from "./routes/notes.js";
import { requireFirebaseUser } from "./middleware/firebaseAuth.js";

const app = express();
const webDirectory = fileURLToPath(new URL("../dist/", import.meta.url));

app.use(express.json());
app.use(express.static(webDirectory, { index: "index.html" }));

app.get("/api/health", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({
    success: true,
    status: "ready",
    message: "MyNotes is running",
  });
});

app.use("/api/notes", requireFirebaseUser, notesRouter);
app.use("/api/drive", requireFirebaseUser, driveRouter);

app.get("/{*path}", (req, res, next) => {
  res.sendFile(path.join(webDirectory, "index.html"), (error) => {
    if (error) next(error);
  });
});

export default app;
