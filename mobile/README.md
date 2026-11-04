# MyNotes Mobile

## Android development build

Google Sign-In uses native Android code, so this app must be tested with an
Expo development build rather than Expo Go.

1. Keep the Firebase Android config at `google-services.json`. It must match
   the Android package name `com.brajmohan.mynotes`.
2. Copy `.env.example` to `.env` if needed. Set `EXPO_PUBLIC_API_URL` to the
   backend's public URL, without the `/api` suffix.
3. Upload the public app configuration to EAS and build/install the development
   APK:

   ```sh
   npm ci
   npx eas-cli@latest env:push --environment development --path .env
   npx eas-cli@latest build --platform android --profile development
   ```

4. Start Metro:

   ```sh
   npx expo start --dev-client --tunnel
   ```

5. Open the installed MyNotes development app and connect it to the Metro
   server. The Render URL is used for the API.

Install the development APK once. For subsequent JavaScript/UI changes, keep
the development app installed and run `npx expo start --dev-client --tunnel`;
Metro serves the updated code without another EAS build. Backend changes still
need to be deployed to Render.

Get the Android SHA-1 certificate fingerprint with
`npx eas-cli@latest credentials --platform android`, register it in Firebase
Project settings, then download an updated `google-services.json` and rebuild.
Google Sign-In requires Google to be enabled in Firebase Authentication.

Each user signs into MyNotes with Google, then selects **Connect Google Drive**
in the app. Each user's own Drive must contain exactly one folder named
`My Notes`; put that user's notes in it.

## Build an Android APK

The production EAS environment must contain every `EXPO_PUBLIC_*` value from
`.env.example`. From the `mobile` directory, copy `.env.example` to `.env` if
needed, verify the Render URL and Google Web client ID have no trailing slash,
and upload the public values:

```sh
npx eas-cli@latest env:push --environment production --path .env
npx eas-cli@latest build --platform android --profile production
```

For development or preview APKs, push the same variables to the matching EAS
environment and build with the corresponding profile. These are public client
configuration values; never put server credentials in `mobile/.env`.

The APK is built in the cloud and the download link is provided by EAS when the
build completes. The API URL is embedded in the app at build time, so rebuild
the APK if the Render URL changes.

## Render backend

The backend Docker container bootstraps the Swytchcode provider bundle when it
starts. Set these as secret environment variables in the Render service:

- `SWYTCHCODE_TOKEN` to let the backend use Swytchcode.
- `FIREBASE_SERVICE_ACCOUNT_JSON` to verify Firebase ID tokens. Create a
  service account private key for project `mynotes-13c34` in Firebase Project
  settings → Service accounts, and put the complete JSON file contents in this
  Render variable. Never commit or share the private key.

Swytchcode stores per-user Drive credentials in its local home directory.
Attach a Render persistent disk mounted at `/var/data`; the Docker image sets
`HOME=/var/data` so those credentials survive restarts and redeploys. Without
the disk, users will have to reconnect Drive after the service restarts.
