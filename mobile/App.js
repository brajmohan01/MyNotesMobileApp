
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  BackHandler,
  FlatList,
  Linking,
  RefreshControl,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  GoogleSignin,
  isSuccessResponse,
} from "@react-native-google-signin/google-signin";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithCredential,
  signOut,
} from "firebase/auth";
import { WebView } from "react-native-webview";
import {
  auth,
  firebaseConfigError,
  googleWebClientId,
} from "./firebase";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, "");
const HEALTH_CHECK_TIMEOUT_MS = 8000;
const SERVER_STARTUP_TIMEOUT_MS = 90000;
const SERVER_RETRY_DELAY_MS = 2500;
const SERVER_READY_CACHE_MS = 60000;
const API_REQUEST_TIMEOUT_MS = 100000;
const missingAppConfig = [
  !API_BASE_URL && "EXPO_PUBLIC_API_URL",
  !googleWebClientId && "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID",
].filter(Boolean);
const appConfigError = [
  firebaseConfigError,
  missingAppConfig.length
    ? `Missing ${missingAppConfig.join(", ")}.`
    : "",
]
  .filter(Boolean)
  .join("\n");

if (googleWebClientId) {
  GoogleSignin.configure({
    webClientId: googleWebClientId,
    offlineAccess: false,
  });
}

function getApiUrl(path) {
  if (!API_BASE_URL) {
    throw new Error(
      "Set EXPO_PUBLIC_API_URL in mobile/.env to your backend URL."
    );
  }

  return `${API_BASE_URL}/api${path}`;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function getCurrentTime() {
  return Date.now();
}

async function fetchWithTimeout(url, options, timeoutMilliseconds) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMilliseconds);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export default function App() {
  const [user, setUser] = useState(auth?.currentUser ?? null);
  const [authReady, setAuthReady] = useState(Boolean(appConfigError));
  const [notes, setNotes] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedNote, setSelectedNote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [serverWaking, setServerWaking] = useState(false);
  const [serverStatus, setServerStatus] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [needsDriveConnection, setNeedsDriveConnection] = useState(false);
  const [driveSetupIssue, setDriveSetupIssue] = useState("");
  const [driveConnectionHint, setDriveConnectionHint] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [driveConnectLoading, setDriveConnectLoading] = useState(false);
  const driveConnectInProgress = useRef(false);
  const driveConnectPendingReturn = useRef(false);
  const appWasBackgrounded = useRef(false);
  const serverReadyAt = useRef(0);
  const serverCheckPromise = useRef(null);

  const checkServerUntilReady = useCallback(async () => {
    const deadline = getCurrentTime() + SERVER_STARTUP_TIMEOUT_MS;
    let attempt = 0;
    let lastIssue = "The server is not responding yet.";
    setServerWaking(true);

    try {
      while (getCurrentTime() < deadline) {
        attempt += 1;
        setServerStatus(
          attempt === 1
            ? "Checking the MyNotes server..."
            : `Waking up the server (attempt ${attempt}). The first request can take up to 90 seconds.`
        );

        try {
          const response = await fetchWithTimeout(
            getApiUrl("/health"),
            { headers: { Accept: "application/json" } },
            HEALTH_CHECK_TIMEOUT_MS
          );

          if (response.ok) {
            const health = await response.json();
            if (health?.success !== true) {
              throw new Error("The server returned an invalid health status.");
            }

            serverReadyAt.current = getCurrentTime();
            return;
          }

          if (response.status < 500) {
            throw new Error(
              `The server health check failed (HTTP ${response.status}).`
            );
          }

          lastIssue = `The server is starting (HTTP ${response.status}).`;
        } catch (healthError) {
          if (
            healthError?.name === "AbortError" ||
            healthError instanceof TypeError
          ) {
            lastIssue = "The server is not responding yet.";
          } else {
            throw healthError;
          }
        }

        await delay(
          Math.min(
            SERVER_RETRY_DELAY_MS,
            Math.max(0, deadline - getCurrentTime())
          )
        );
      }

      throw new Error(
        `The server did not become ready after 90 seconds. ${lastIssue} Check your connection and try again.`
      );
    } finally {
      setServerWaking(false);
      setServerStatus("");
    }
  }, []);

  const ensureServerReady = useCallback(async () => {
    if (getCurrentTime() - serverReadyAt.current < SERVER_READY_CACHE_MS) {
      return;
    }

    if (!serverCheckPromise.current) {
      serverCheckPromise.current = checkServerUntilReady();
    }

    const check = serverCheckPromise.current;
    try {
      await check;
    } finally {
      if (serverCheckPromise.current === check) {
        serverCheckPromise.current = null;
      }
    }
  }, [checkServerUntilReady]);

  const apiRequest = useCallback(async (path, options = {}) => {
    if (!user) {
      throw new Error("Sign in to continue.");
    }

    await ensureServerReady();
    const token = await user.getIdToken();

    try {
      const response = await fetchWithTimeout(getApiUrl(path), {
        ...options,
        headers: {
          Accept: "application/json",
          ...options.headers,
          Authorization: `Bearer ${token}`,
        },
      }, API_REQUEST_TIMEOUT_MS);
      const responseText = await response.text();
      let data;

      if (responseText) {
        try {
          data = JSON.parse(responseText);
        } catch {
          if (response.ok) {
            throw new Error("The server returned an invalid response.");
          }
        }
      }

      if (!response.ok) {
        if (response.status >= 500) {
          serverReadyAt.current = 0;
        }
        const requestError = new Error(
          data?.message ||
            (response.status >= 500
              ? `The server is temporarily unavailable (HTTP ${response.status}). Try again shortly.`
              : `The request failed (HTTP ${response.status}).`)
        );
        requestError.code = data?.code;
        throw requestError;
      }

      if (!data || typeof data !== "object") {
        throw new Error("The server returned an invalid response.");
      }

      return data;
    } catch (requestError) {
      if (requestError?.name === "AbortError") {
        serverReadyAt.current = 0;
        throw new Error("The server took too long to respond. Please try again.");
      }
      if (requestError instanceof TypeError) {
        serverReadyAt.current = 0;
        throw new Error(
          "Could not reach the MyNotes server. Check your internet connection and try again."
        );
      }
      throw requestError;
    }
  }, [user, ensureServerReady]);

  async function signInWithGoogle() {
    try {
      setAuthLoading(true);
      setError("");

      if (!googleWebClientId) {
        throw new Error("Google sign-in is not configured in mobile/.env.");
      }

      await GoogleSignin.hasPlayServices({
        showPlayServicesUpdateDialog: true,
      });
      const response = await GoogleSignin.signIn();

      if (!isSuccessResponse(response)) {
        return;
      }

      if (!response.data.idToken) {
        throw new Error("Google did not return an ID token.");
      }

      const credential = GoogleAuthProvider.credential(response.data.idToken);
      await signInWithCredential(auth, credential);
    } catch (signInError) {
      setError(signInError.message || "Unable to sign in with Google.");
    } finally {
      setAuthLoading(false);
    }
  }

  async function signOutUser() {
    try {
      await signOut(auth);
      await GoogleSignin.signOut();
    } catch (signOutError) {
      setError(signOutError.message || "Unable to sign out.");
    }
  }

  // Fetch notes from Express backend
  const fetchNotes = useCallback(async (
    query = "",
    { afterDriveConnect = false } = {}
  ) => {
    if (!user) return;

    try {
      setLoading(true);
      setError("");
      setNeedsDriveConnection(false);
      setDriveSetupIssue("");

      const data = await apiRequest(
        `/notes?search=${encodeURIComponent(query)}`
      );
      setNotes(data.notes);
      setDriveConnectionHint("");
    } catch (err) {
      if (err.code === "drive_not_connected") {
        setNotes([]);
        setNeedsDriveConnection(true);
        setDriveConnectionHint(
          afterDriveConnect
            ? "Google Drive is not connected yet. If the browser says the link was already used, return here and tap Connect Google Drive to create a fresh link."
            : ""
        );
      } else if (
        err.code === "notes_folder_not_found" ||
        err.code === "multiple_notes_folders"
      ) {
        setNotes([]);
        setDriveSetupIssue(err.message);
      } else {
        setError(err.message || "Something went wrong");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [apiRequest, user]);

  // Fetch individual note
  async function openNote(note) {
    try {
      setLoading(true);
      setError("");

      const data = await apiRequest(
        `/notes/${encodeURIComponent(note.id)}`
      );

      setSelectedNote({
        ...note,
        content: data.content,
      });
      setDriveSetupIssue("");
    } catch (err) {
      if (err.code === "drive_not_connected") {
        setNeedsDriveConnection(true);
      } else if (
        err.code === "notes_folder_not_found" ||
        err.code === "multiple_notes_folders"
      ) {
        setDriveSetupIssue(err.message);
      } else {
        setError(err.message || "Unable to open note");
      }
    } finally {
      setLoading(false);
    }
  }

  async function connectGoogleDrive() {
    if (driveConnectInProgress.current) return;

    driveConnectInProgress.current = true;
    try {
      setDriveConnectLoading(true);
      setError("");
      const { url } = await apiRequest("/drive/connect", {
        method: "POST",
      });
      if (!url) {
        throw new Error("The server did not return a Google Drive connection link.");
      }

      driveConnectPendingReturn.current = true;
      setDriveConnectionHint(
        "Complete the Google Drive step in your browser, then return here. This authorization link can only be used once."
      );
      await Linking.openURL(url);
    } catch (connectError) {
      driveConnectPendingReturn.current = false;
      setError(connectError.message || "Unable to connect Google Drive.");
    } finally {
      driveConnectInProgress.current = false;
      setDriveConnectLoading(false);
    }
  }

  // Return to notes list
  function goBack() {
    setSelectedNote(null);
    setError("");
  }

  useEffect(() => {
    if (appConfigError || !auth) return;

    return onAuthStateChanged(auth, (signedInUser) => {
      setUser(signedInUser);
      setAuthReady(true);
      setSelectedNote(null);

      if (!signedInUser) {
        setNotes([]);
        setNeedsDriveConnection(false);
        setLoading(false);
      }
    });
  }, []);

  useEffect(() => {
    if (!authReady || !user || selectedNote) return;

    const timer = setTimeout(() => {
      fetchNotes(search);
    }, 350);

    return () => clearTimeout(timer);
  }, [authReady, user, search, selectedNote, fetchNotes]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active") {
        appWasBackgrounded.current = true;
        serverReadyAt.current = 0;
        return;
      }

      if (!appWasBackgrounded.current) return;
      appWasBackgrounded.current = false;

      if (driveConnectPendingReturn.current) {
        driveConnectPendingReturn.current = false;
        setDriveConnectionHint("Checking your Google Drive connection...");
        fetchNotes(search, { afterDriveConnect: true });
      }
    });

    return () => subscription.remove();
  }, [fetchNotes, search]);

  // Handle Android hardware back button
  useEffect(() => {
    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (selectedNote) {
          goBack();
          return true;
        }

        return false;
      }
    );

    return () => backHandler.remove();
  }, [selectedNote]);

  if (!authReady) {
    return (
      <SafeAreaView style={styles.authContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
      </SafeAreaView>
    );
  }

  if (appConfigError) {
    return (
      <SafeAreaView style={styles.authContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#111827" />
        <Text style={styles.appTitle}>MyNotes setup required</Text>
        <Text style={styles.authDescription}>
          This APK is missing its public app configuration:
          {"\n\n"}
          {appConfigError}
          {"\n\n"}
          Add these values to the EAS build environment and build a new APK.
        </Text>
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.authContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#111827" />
        <Text style={styles.appTitle}>MyNotes</Text>
        <Text style={styles.authDescription}>
          Sign in with Google to connect your Drive and view your notes.
        </Text>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <TouchableOpacity
          onPress={signInWithGoogle}
          style={styles.authButton}
          disabled={authLoading}
          activeOpacity={0.8}
        >
          {authLoading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.authButtonText}>Continue with Google</Text>
          )}
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // NOTE READER SCREEN
  if (selectedNote) {
    return (
      <SafeAreaView style={styles.readerContainer}>
        <StatusBar
          barStyle="light-content"
          backgroundColor="#111827"
        />

        <View style={styles.readerHeader}>
          <TouchableOpacity
            onPress={goBack}
            style={styles.backButtonContainer}
            activeOpacity={0.7}
          >
            <Text style={styles.backButton}>‹ Back</Text>
          </TouchableOpacity>

          <Text style={styles.headerTitle} numberOfLines={1}>
            {selectedNote.title}
          </Text>
        </View>

        <WebView
          originWhitelist={["*"]}
          source={{
            html: `
              <!DOCTYPE html>
              <html>
                <head>
                  <meta name="viewport" content="width=device-width, initial-scale=1.0">
                  <style>
                    body {
                      font-family: Arial, sans-serif;
                      padding: 18px;
                      color: #1f2937;
                      line-height: 1.7;
                      overflow-wrap: break-word;
                    }

                    img {
                      max-width: 100%;
                      height: auto;
                    }

                    a {
                      color: #2563eb;
                    }
                  </style>
                </head>
                <body>${selectedNote.content}</body>
              </html>
            `,
          }}
          style={styles.webview}
        />
      </SafeAreaView>
    );
  }

  // NOTES LIST SCREEN
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="#111827"
      />

      <View style={styles.header}>
        <View>
          <Text style={styles.appTitle}>MyNotes</Text>
          <Text style={styles.subtitle}>
            Your notes, everywhere.
          </Text>
        </View>

        <TouchableOpacity
          onPress={() => fetchNotes(search)}
          style={styles.refreshButtonContainer}
        >
          <Text style={styles.refreshButton}>↻</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={signOutUser} style={styles.signOutButton}>
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
        <Text style={styles.searchIcon}>⌕</Text>

        <TextInput
          style={styles.searchInput}
          placeholder="Search your notes..."
          placeholderTextColor="#9ca3af"
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {serverWaking && notes.length > 0 ? (
        <View style={styles.serverStatusContainer}>
          <ActivityIndicator size="small" color="#2563eb" />
          <Text style={styles.serverStatusText}>{serverStatus}</Text>
        </View>
      ) : null}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Your Notes</Text>

        <Text style={styles.noteCount}>
          {notes.length} notes
        </Text>
      </View>

      {loading && notes.length === 0 ? (
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loadingMessage}>
            {serverWaking
              ? serverStatus
              : "Loading your notes..."}
          </Text>
        </View>
      ) : needsDriveConnection ? (
        <View style={styles.emptyState}>
          {driveConnectionHint ? (
            <Text style={styles.setupDescription}>{driveConnectionHint}</Text>
          ) : null}
          <Text style={styles.emptyText}>
            Connect your Google Drive to see your notes.
          </Text>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <TouchableOpacity
            onPress={connectGoogleDrive}
            style={styles.authButton}
            disabled={driveConnectLoading}
            activeOpacity={0.8}
          >
            {driveConnectLoading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.authButtonText}>Connect Google Drive</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : driveSetupIssue ? (
        <View style={styles.emptyState}>
          <Text style={styles.errorText}>{driveSetupIssue}</Text>
          <Text style={styles.setupDescription}>
            In the Google Drive account you connected, create exactly one
            folder named “My Notes” and put your notes inside it. Then check
            again.
          </Text>
          <TouchableOpacity onPress={() => fetchNotes(search)}>
            <Text style={styles.retryButton}>Check Google Drive again</Text>
          </TouchableOpacity>
        </View>
      ) : error ? (
        <View style={styles.emptyState}>
          <Text style={styles.errorText}>{error}</Text>

          <TouchableOpacity onPress={() => fetchNotes(search)}>
            <Text style={styles.retryButton}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={notes}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                fetchNotes(search);
              }}
            />
          }
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              No notes found.
            </Text>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.noteCard}
              onPress={() => openNote(item)}
              activeOpacity={0.7}
            >
              <View style={styles.noteIcon}>
                <Text style={styles.noteIconText}>N</Text>
              </View>

              <View style={styles.noteDetails}>
                <Text style={styles.noteTitle}>
                  {item.title}
                </Text>

                <Text style={styles.noteType}>
                  HTML note · Google Drive
                </Text>
              </View>

              <Text style={styles.arrow}>›</Text>
            </TouchableOpacity>
          )}
        />
      )}

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          {user.email || "Signed in"} · Google Drive
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  authContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#111827",
    padding: 28,
  },

  authDescription: {
    color: "#cbd5e1",
    fontSize: 15,
    lineHeight: 22,
    marginTop: 12,
    marginBottom: 24,
    textAlign: "center",
  },

  authButton: {
    alignItems: "center",
    backgroundColor: "#2563eb",
    borderRadius: 12,
    justifyContent: "center",
    marginTop: 18,
    minHeight: 50,
    paddingHorizontal: 20,
  },

  authButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },

  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },

  readerContainer: {
    flex: 1,
    backgroundColor: "#ffffff",
  },

 header: {
  backgroundColor: "#111827",
  paddingHorizontal: 22,
  paddingTop: 45,
  paddingBottom: 12,
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
},

 readerHeader: {
  minHeight: 85,
  backgroundColor: "#111827",
  flexDirection: "row",
  alignItems: "center",
  paddingHorizontal: 16,
  paddingTop: 40,
  paddingBottom: 5,
},

  appTitle: {
    color: "#ffffff",
    fontSize: 27,
    fontWeight: "800",
  },

  subtitle: {
    color: "#9ca3af",
    marginTop: 4,
    fontSize: 13,
  },

  refreshButtonContainer: {
    padding: 5,
  },

  refreshButton: {
    color: "#ffffff",
    fontSize: 30,
  },

  signOutButton: {
    paddingHorizontal: 8,
    paddingVertical: 10,
  },

  signOutText: {
    color: "#93c5fd",
    fontSize: 13,
    fontWeight: "600",
  },

  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    margin: 18,
    paddingHorizontal: 15,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },

  searchIcon: {
    fontSize: 25,
    color: "#64748b",
    marginRight: 10,
  },

  searchInput: {
    flex: 1,
    height: 50,
    color: "#111827",
    fontSize: 15,
  },

  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 22,
    marginBottom: 12,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },

  noteCount: {
    color: "#64748b",
  },

  list: {
    paddingHorizontal: 18,
    paddingBottom: 20,
  },

  noteCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    padding: 15,
    borderRadius: 13,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },

  noteIcon: {
    width: 43,
    height: 43,
    backgroundColor: "#dbeafe",
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },

  noteIconText: {
    color: "#2563eb",
    fontSize: 20,
    fontWeight: "800",
  },

  noteDetails: {
    flex: 1,
    marginLeft: 13,
  },

  noteTitle: {
    color: "#111827",
    fontWeight: "600",
    fontSize: 15,
  },

  noteType: {
    color: "#94a3b8",
    fontSize: 12,
    marginTop: 5,
  },

  arrow: {
    fontSize: 25,
    color: "#94a3b8",
  },

  loadingState: {
    alignItems: "center",
    marginTop: 50,
    paddingHorizontal: 24,
  },

  loadingMessage: {
    color: "#64748b",
    marginTop: 14,
    textAlign: "center",
  },

  serverStatusContainer: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    marginHorizontal: 20,
    marginBottom: 14,
  },

  serverStatusText: {
    color: "#64748b",
    flex: 1,
    fontSize: 13,
  },

  emptyState: {
    alignItems: "center",
    marginTop: 50,
    padding: 20,
  },

  emptyText: {
    textAlign: "center",
    marginTop: 40,
    color: "#64748b",
  },

  setupDescription: {
    color: "#64748b",
    lineHeight: 21,
    marginTop: 16,
    textAlign: "center",
  },

  errorText: {
    color: "#dc2626",
    textAlign: "center",
  },

  retryButton: {
    color: "#2563eb",
    marginTop: 15,
    fontWeight: "700",
  },

  footer: {
    padding: 14,
    alignItems: "center",
    borderTopWidth: 1,
    borderColor: "#e2e8f0",
  },

  footerText: {
    color: "#94a3b8",
    fontSize: 12,
  },

  backButtonContainer: {
    paddingVertical: 12,
    paddingHorizontal: 8,
    marginRight: 10,
    justifyContent: "center",
  },

  backButton: {
    color: "#93c5fd",
    fontSize: 17,
  },

  headerTitle: {
    color: "#ffffff",
    fontWeight: "600",
    fontSize: 16,
    flex: 1,
  },

  webview: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
});
