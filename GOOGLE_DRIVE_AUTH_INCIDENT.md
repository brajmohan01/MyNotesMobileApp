# Google Drive authorization incident

**Incident:** The Google Drive authorization page repeatedly displayed
“This link was already used” while connecting a MyNotes account.

**Status:** The mobile app has since been replaced by a web app. The original
failure was investigated, but its underlying cause was not conclusively
identified in the available logs.

## Summary

The app did request a new Google Drive authorization URL for each observed
attempt. Render logged different SHA-256 URL fingerprints for successive
requests, so the evidence does not support a single cached URL being returned
by the MyNotes backend.

The account still was not connected after those attempts. When MyNotes tried
to list notes, Swytchcode returned `tenant_not_connected`. That error confirms
the end user's Google Drive authorization had not completed successfully from
Swytchcode's perspective.

The visible “already used” page was served from `auth.swytchcode.com`. The
backend logs show link creation and later failed Drive calls, but do not show
why the auth page considered each fresh link used. Therefore, the logs establish
the failure state, not the exact cause of the auth-page rejection.

## What happened in the original app

1. The signed-in app sent an authenticated `POST /api/drive/connect`.
2. The backend called `connect({ provider: "Google Drive", tenantId })` from
   `@swytchcode/runtime` and returned the generated authorization URL.
3. The app opened that URL in the browser.
4. On returning to the app, it tried to list notes. The backend called the
   enabled `drive.file.list` method for that same tenant.
5. Swytchcode returned an error with category `tenant_not_connected`, so
   MyNotes correctly displayed its Drive connection prompt again.

The Swytchcode multi-tenant guide describes OAuth connect links as single-use
and expiring after 10 minutes. A link that has been consumed, reopened, shared,
or allowed to expire is expected to be refused. The app must create a new link
for a new attempt.

## Evidence from Render

The following safe request IDs and shortened URL fingerprints were logged for
separate link-creation requests:

| Request ID | URL fingerprint |
|---|---|
| `a5ac3ace-cf84-4d77-9bc7-92c02a06688c` | `7f3f84ba93d9` |
| `bb72d63c-1a01-4b34-8098-8f53ad899b98` | `b8e49ddd0447` |
| `6323f2fb-2911-4627-8292-9b0d109ae88a` | `08b6cbc4cede` |
| `946d20f0-5ff0-4f4f-a01f-7b396780e77e` | `5ccd4cbd81bd` |

These are different fingerprints, consistent with Swytchcode returning
different URLs. A fingerprint is only a comparison aid; it does not prove that
the auth service accepted, displayed, or completed the corresponding URL.

Subsequent note-list attempts logged errors categorized
`tenant_not_connected`, with suggested action to show the user's Connect
button. The logs did not contain a successful authorization confirmation or
connected-account status.

## Was this caused by Swytchcode?

**Swytchcode was part of the flow, but the available evidence cannot assign
the root cause.**

- **Confirmed:** The backend used the Swytchcode SDK/runtime to generate each
  OAuth URL, and the URL opened on the Swytchcode auth domain.
- **Confirmed:** Each sampled backend request produced a different URL
  fingerprint.
- **Confirmed:** Subsequent Swytchcode Drive calls reported that this tenant
  had not connected Google Drive.
- **Not confirmed:** Whether Swytchcode's auth service rejected a genuinely
  unused URL, or whether the browser/client caused the URL to be opened or
  consumed before the user completed the flow.
- **Not confirmed:** Whether the OAuth page completed and then failed to
  persist/associate the connection with the tenant.

So it is accurate to say the failure occurred in a Swytchcode-managed OAuth
flow, but it is **not** accurate to claim from these logs alone that Swytchcode
was definitively at fault. Nor do the logs prove that the Android client was
definitively at fault.

## Client-side investigation and app change

The original Android client opened the URL with React Native's generic
`Linking.openURL`. It was later changed to Expo's browser module to use an
Android Custom Tab, following the Swytchcode mobile guidance. The user still
reported the same page. There is no verified successful Android authorization
after that change, so the change did not establish a fix.

The project has since been replaced with a browser-based website. It opens a
new tab directly from the user's click, obtains a fresh URL from the backend,
then navigates that tab to the URL. This is a more suitable browser flow and
avoids the native-app-to-browser handoff. However, the web app still uses the
same Swytchcode `connect()` endpoint and authorization service. Moving to the
web therefore avoids one possible client-side variable but does not, by
itself, prove that Swytchcode's one-time-link issue is resolved.

## Log messages that were not the root cause

- Render's “Detected service running on port 10000” is normal platform port
  detection, not an OAuth error.
- The PostHog shutdown/dropped-batch warnings appeared during CLI process
  shutdown. They do not explain why the tenant remained unconnected.
- The `tenant_not_connected` stack trace is from the later notes request. It
  reports the consequence of the missing connection; it is not the message
  that explains why the auth page rejected the URL.

## Recommended next diagnostic

If a fresh web attempt still shows “already used”:

1. Use one attempt only: click Connect once and finish in the newly opened
   tab; do not reload, revisit, or reuse that URL.
2. Record the Render request ID and fingerprint for that click, plus the time
   and the corresponding `SWY-ERR-...` reference ID, if one is logged.
3. Ask Swytchcode support to investigate that specific newly generated link
   and reference ID. The backend has no auth-service callback or response
   record in the evidence collected so far.
4. Never send support or paste into logs the full one-time authorization URL,
   Firebase ID token, service-account JSON, Swytchcode token, or Firebase user
   ID. The request ID, URL fingerprint, timestamp, and Swytchcode reference ID
   are the useful correlation details.

Reference: [Swytchcode multi-tenant guide](https://docs.swytchcode.com/guides/multi-tenant/)
