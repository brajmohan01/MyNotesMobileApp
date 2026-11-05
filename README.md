# MyNotes

MyNotes is a responsive website for browsing notes stored in each user's
Google Drive. Sign in with Google, connect Drive once, and keep notes in one
folder named `My Notes`.

## Run locally

Requirements: Node.js 24, npm, and a Firebase service account for project
`mynotes-13c34`.

1. Copy `.env.example` to `.env`.
2. In Firebase Console → Project settings → Service accounts, create/download
   a private key for project `mynotes-13c34`.
3. Save that file in the project root as `firebase-service-account.json`.
   This file is ignored by Git; do not commit or share it.
4. Put your Swytchcode token in the `SWYTCHCODE_TOKEN` field in `.env`.

```sh
npm ci
npm run build
npm start
```

Open `http://localhost:3000`. To work on the web UI with hot reload, run the
backend in one terminal and the Vite server in another:

```sh
npm run dev
npm run dev:web
```

Open `http://localhost:5173`; Vite proxies `/api` requests to the local backend.
The backend reads `FIREBASE_SERVICE_ACCOUNT_PATH` and `SWYTCHCODE_TOKEN` from
the root `.env`. For Render, continue setting
`FIREBASE_SERVICE_ACCOUNT_JSON` and `SWYTCHCODE_TOKEN` as service environment
variables.

The Firebase web configuration in `web/main.js` is a public client
configuration, not a secret. In Firebase Authentication, enable Google sign-in
and add the website's production hostname under **Authorized domains**.

## Deploy to Render

Deploy this repository as a Docker web service. Set `SWYTCHCODE_TOKEN` and
`FIREBASE_SERVICE_ACCOUNT_JSON` in the Render environment. Configure a
persistent disk mounted at `/var/data` so per-user Google Drive connections
survive restarts, and set `/api/health` as the health check path.

The Docker build compiles the website and serves it from the same origin as
the API. Firebase ID tokens are verified by the backend before any notes or
Drive endpoints are used.
