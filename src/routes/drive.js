import { createHash, randomUUID } from "node:crypto";
import { connect } from "@swytchcode/runtime";
import express from "express";

const router = express.Router();

router.post("/connect", (req, res) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  const requestId = randomUUID();
  res.set("X-Connection-Request-Id", requestId);

  try {
    const connection = connect({
      provider: "Google Drive",
      tenantId: req.firebaseUser.uid,
    });
    const fingerprint = createHash("sha256")
      .update(connection.url)
      .digest("hex")
      .slice(0, 12);

    console.info(
      `Google Drive authorization link created [${requestId}] fingerprint=${fingerprint}`
    );

    res.json({
      success: true,
      url: connection.url,
      requestId,
    });
  } catch (error) {
    console.error(`Create Drive connection error [${requestId}]:`, error);

    res.status(502).json({
      success: false,
      code: "drive_connection_unavailable",
      message:
        "Unable to start Google Drive connection. Check the server's Swytchcode setup.",
      requestId,
    });
  }
});

export default router;
