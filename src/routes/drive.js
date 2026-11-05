import { connect } from "@swytchcode/runtime";
import express from "express";

const router = express.Router();

router.post("/connect", (req, res) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");

  try {
    const connection = connect({
      provider: "Google Drive",
      tenantId: req.firebaseUser.uid,
    });

    res.json({
      success: true,
      url: connection.url,
    });
  } catch (error) {
    console.error("Create Drive connection error:", error);

    res.status(502).json({
      success: false,
      code: "drive_connection_unavailable",
      message:
        "Unable to start Google Drive connection. Check the server's Swytchcode setup.",
    });
  }
});

export default router;
