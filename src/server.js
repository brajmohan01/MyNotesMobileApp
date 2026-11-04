
import express from "express";
import driveRouter from "./routes/drive.js";
import notesRouter from "./routes/notes.js";
import { requireFirebaseUser } from "./middleware/firebaseAuth.js";

const app = express();

app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "MyNotes Mobile API is running",
  });
});

app.use("/api/notes", requireFirebaseUser, notesRouter);
app.use("/api/drive", requireFirebaseUser, driveRouter);

export default app;
