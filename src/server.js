
import express from "express";
import notesRouter from "./routes/notes.js";

const app = express();

app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "MyNotes Mobile API is running",
  });
});

app.use("/api/notes", notesRouter);

export default app;
