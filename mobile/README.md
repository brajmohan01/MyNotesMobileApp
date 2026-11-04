# MyNotes Mobile

## Test with Expo Go

1. Copy `.env.example` to `.env` and set `EXPO_PUBLIC_API_URL` to the backend's
   public URL, without the `/api` suffix. For a local backend, use your
   computer's LAN IP address, such as `http://192.168.1.20:3000`.
2. Install dependencies and start Expo:

   ```sh
   npm ci
   npx expo start --tunnel
   ```

3. Scan the QR code with Expo Go. When using a local backend, the phone and
   computer must be on the same network. The tunnel only exposes the Expo
   development server; use the Render URL to access the API from anywhere.

## Build an Android APK

Set `EXPO_PUBLIC_API_URL` to the Render service's HTTPS URL in the EAS
`production` environment, then run:

```sh
npx eas-cli@latest env:set \
  --name EXPO_PUBLIC_API_URL \
  --value https://your-render-service.onrender.com \
  --environment production \
  --visibility plaintext
npx eas-cli@latest build --platform android --profile production
```

The APK is built in the cloud and the download link is provided by EAS when the
build completes. The API URL is embedded in the app at build time, so rebuild
the APK if the Render URL changes.

For an internal preview APK, set the same variable in the EAS `preview`
environment and use `--profile preview`.

## Render backend

The backend Docker container bootstraps the Swytchcode provider bundle when it
starts. Set `SWYTCHCODE_TOKEN` as a secret environment variable in the Render
service settings so the CLI can fetch the bundle. Keep this token on the
backend only; do not put it in `mobile/.env`, an `EXPO_PUBLIC_` variable, or
source control. Redeploy the Render service after changing the Dockerfile or
setting the secret.
