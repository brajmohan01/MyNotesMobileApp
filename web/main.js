import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyB0_k9GAGH7Vfp2dDvrLoEkcWPGCGB5Q3A",
  authDomain: "mynotes-13c34.firebaseapp.com",
  projectId: "mynotes-13c34",
  storageBucket: "mynotes-13c34.firebasestorage.app",
  messagingSenderId: "156696498305",
  appId: "1:156696498305:web:6ea326d77bc2f4df2b7d80",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
const elements = {
  authView: document.querySelector("#auth-view"),
  appView: document.querySelector("#app-view"),
  authError: document.querySelector("#auth-error"),
  signIn: document.querySelector("#sign-in"),
  signOut: document.querySelector("#sign-out"),
  userEmail: document.querySelector("#user-email"),
  notesList: document.querySelector("#notes-list"),
  sidebarCount: document.querySelector("#sidebar-count"),
  pageTitle: document.querySelector("#page-title"),
  pageSubtitle: document.querySelector("#page-subtitle"),
  search: document.querySelector("#search"),
  refresh: document.querySelector("#refresh-notes"),
  status: document.querySelector("#status-message"),
  detailEmpty: document.querySelector("#detail-empty"),
  detail: document.querySelector("#note-detail"),
  back: document.querySelector("#back-to-notes"),
  noteTitle: document.querySelector("#note-title"),
  noteDate: document.querySelector("#note-date"),
  noteContent: document.querySelector("#note-content"),
};

let currentUser = null;
let notes = [];
let selectedNoteId = null;
let searchTimer;
let connectTab;
let waitingForDrive = false;
let loadingNotes = false;
let listRefreshPending = false;
const isMobileBrowser =
  window.matchMedia("(max-width: 760px)").matches ||
  /Android|iPhone|iPad/i.test(navigator.userAgent);

function showMessage(element, message, kind = "error") {
  element.textContent = message;
  element.className = `message message-${kind}`;
  element.hidden = !message;
}

async function apiRequest(path, options = {}) {
  if (!currentUser) {
    throw new Error("Please sign in to continue.");
  }

  const token = await currentUser.getIdToken();
  const response = await fetch(`/api${path}`, {
    ...options,
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...options.headers,
      Authorization: `Bearer ${token}`,
    },
  });
  const responseText = await response.text();
  let data;

  if (responseText) {
    try {
      data = JSON.parse(responseText);
    } catch {
      throw new Error("The server returned an invalid response.");
    }
  }

  if (!response.ok) {
    const error = new Error(
      data?.message || `The request failed (HTTP ${response.status}).`
    );
    error.code = data?.code;
    throw error;
  }

  if (!data || typeof data !== "object") {
    throw new Error("The server returned an invalid response.");
  }

  return data;
}

function setLoading(isLoading) {
  loadingNotes = isLoading;
  elements.refresh.disabled = isLoading;
  elements.refresh.classList.toggle("is-spinning", isLoading);
  if (isLoading) {
    elements.notesList.innerHTML = `
      <div class="list-loading">
        <span class="spinner"></span>
        <span>Finding your notes...</span>
      </div>`;
  }
}

function formatDate(value) {
  if (!value) return "In your Google Drive";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "In your Google Drive";

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year:
      date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  }).format(date);
}

function renderNotes() {
  elements.sidebarCount.textContent = String(notes.length);
  if (notes.length === 0) {
    elements.notesList.innerHTML = `
      <div class="empty-list">
        <div class="empty-list-icon" aria-hidden="true">✳</div>
        <h2>No notes here yet</h2>
        <p>Notes from your “My Notes” Drive folder will show up here.</p>
      </div>`;
    return;
  }

  elements.notesList.replaceChildren(
    ...notes.map((note) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `note-card${note.id === selectedNoteId ? " note-card-selected" : ""}`;
      button.setAttribute("aria-label", `Open note: ${note.title}`);

      const heading = document.createElement("span");
      heading.className = "note-card-title";
      heading.textContent = note.title;
      const date = document.createElement("span");
      date.className = "note-card-date";
      date.textContent = formatDate(note.modifiedTime);
      const arrow = document.createElement("span");
      arrow.className = "note-card-arrow";
      arrow.setAttribute("aria-hidden", "true");
      arrow.textContent = "↗";
      button.append(heading, date, arrow);
      button.addEventListener("click", () => openNote(note));
      return button;
    })
  );
}

function renderSelectedNote(note) {
  selectedNoteId = note?.id ?? null;
  elements.detail.hidden = !note;
  elements.detailEmpty.hidden = Boolean(note);
  if (!note) {
    elements.noteContent.removeAttribute("srcdoc");
    renderNotes();
    return;
  }

  elements.noteTitle.textContent = note.title;
  elements.noteDate.textContent = formatDate(note.modifiedTime);
  elements.noteContent.srcdoc = `<!doctype html>
    <html><head><meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline' https:; font-src https: data:">
      <style>
        body{font:16px/1.8 'DM Sans',Arial,sans-serif;color:#41433f;margin:0;padding:24px;overflow-wrap:anywhere}
        img{max-width:100%;height:auto}a{color:#638072}pre{white-space:pre-wrap;overflow-wrap:anywhere}
        table{max-width:100%;border-collapse:collapse}td,th{padding:7px;border:1px solid #ddd}
      </style>
    </head><body>${note.content}</body></html>`;
  renderNotes();
}

function showSignedInView(user) {
  currentUser = user;
  elements.authView.hidden = Boolean(user);
  elements.appView.hidden = !user;
  elements.userEmail.textContent = user?.displayName || user?.email || "";

  if (!user) {
    notes = [];
    selectedNoteId = null;
    elements.notesList.replaceChildren();
    elements.search.value = "";
    elements.status.hidden = true;
    elements.detail.hidden = true;
    elements.detailEmpty.hidden = false;
    return;
  }

  void fetchNotes();
}

async function fetchNotes() {
  if (!currentUser) return;
  if (loadingNotes) {
    listRefreshPending = true;
    return;
  }

  setLoading(true);
  showMessage(elements.status, "");
  elements.pageTitle.textContent = "Your notes";
  elements.pageSubtitle.textContent =
    "A little space for everything on your mind.";

  try {
    const query = encodeURIComponent(elements.search.value.trim());
    const result = await apiRequest(`/notes?search=${query}`);
    notes = result.notes;
    renderNotes();
  } catch (error) {
    notes = [];
    renderNotes();

    if (error.code === "drive_not_connected") {
      elements.pageTitle.textContent = "Connect your Drive";
      elements.pageSubtitle.textContent =
        "Your notes will be here once Google Drive is connected.";
      showMessage(
        elements.status,
        "Connect your Google Drive to see your notes.",
        "info"
      );
      addConnectButton();
    } else if (
      error.code === "notes_folder_not_found" ||
      error.code === "multiple_notes_folders"
    ) {
      elements.pageTitle.textContent = "A quick Drive check";
      elements.pageSubtitle.textContent = "One small thing before your notes appear.";
      showMessage(
        elements.status,
        error.code === "notes_folder_not_found"
          ? 'Create a folder named “My Notes” in the Google Drive account you connected, then check again.'
          : 'More than one “My Notes” folder was found. Keep just one folder with that name, then check again.',
        "info"
      );
      addRetryButton();
    } else {
      showMessage(elements.status, error.message || "Unable to load your notes.");
      addRetryButton();
    }
  } finally {
    loadingNotes = false;
    elements.refresh.disabled = false;
    elements.refresh.classList.remove("is-spinning");
    if (listRefreshPending) {
      listRefreshPending = false;
      queueMicrotask(fetchNotes);
    }
  }
}

function addConnectButton() {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "button button-dark connect-button";
  button.textContent = "Connect Google Drive";
  button.addEventListener("click", connectGoogleDrive);
  elements.notesList.replaceChildren(button);
}

function addRetryButton() {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "button button-light connect-button";
  button.textContent = "Check again";
  button.addEventListener("click", fetchNotes);
  elements.notesList.replaceChildren(button);
}

async function openNote(note) {
  if (loadingNotes) return;
  setLoading(true);
  showMessage(elements.status, "");

  try {
    const result = await apiRequest(`/notes/${encodeURIComponent(note.id)}`);
    renderSelectedNote({ ...note, content: result.content });
  } catch (error) {
    if (error.code === "drive_not_connected") {
      showMessage(
        elements.status,
        "Google Drive is disconnected. Connect it again to open this note.",
        "info"
      );
      addConnectButton();
    } else {
      showMessage(elements.status, error.message || "Unable to open this note.");
      addRetryButton();
    }
  } finally {
    loadingNotes = false;
    elements.refresh.disabled = false;
    elements.refresh.classList.remove("is-spinning");
    if (listRefreshPending) {
      listRefreshPending = false;
      queueMicrotask(fetchNotes);
    }
  }
}

async function connectGoogleDrive() {
  if (connectTab && !connectTab.closed) {
    connectTab.focus();
    return;
  }

  connectTab = window.open("about:blank", "_blank");
  if (!connectTab) {
    showMessage(
      elements.status,
      "Your browser blocked the authorization tab. Allow pop-ups for this site and try again."
    );
    return;
  }

  connectTab.opener = null;
  showMessage(
    elements.status,
    "Opening a secure Google Drive connection. Finish in the new browser tab, then return here.",
    "info"
  );

  try {
    const { url } = await apiRequest("/drive/connect", {
      method: "POST",
      headers: {
        "Cache-Control": "no-cache, no-store",
        Pragma: "no-cache",
      },
    });
    if (!url) {
      throw new Error("The server did not return a Google Drive connection link.");
    }

    waitingForDrive = true;
    connectTab.location.replace(url);
  } catch (error) {
    connectTab.close();
    connectTab = null;
    showMessage(elements.status, error.message || "Unable to connect Google Drive.");
  }
}

elements.signIn.addEventListener("click", async () => {
  elements.signIn.disabled = true;
  elements.signIn.classList.add("is-loading");
  showMessage(elements.authError, "");
  try {
    if (isMobileBrowser) {
      await signInWithRedirect(auth, googleProvider);
    } else {
      await signInWithPopup(auth, googleProvider);
    }
  } catch (error) {
    if (error.code !== "auth/popup-closed-by-user") {
      showMessage(
        elements.authError,
        error.message || "Unable to sign in with Google."
      );
    }
  } finally {
    elements.signIn.disabled = false;
    elements.signIn.classList.remove("is-loading");
  }
});

elements.signOut.addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch (error) {
    showMessage(elements.status, error.message || "Unable to sign out.");
  }
});

elements.refresh.addEventListener("click", fetchNotes);
elements.back.addEventListener("click", () => renderSelectedNote(null));
elements.search.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(fetchNotes, 250);
});
document.addEventListener("keydown", (event) => {
  if (
    event.key === "/" &&
    !["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)
  ) {
    event.preventDefault();
    elements.search.focus();
  }
});
window.addEventListener("focus", () => {
  if (!waitingForDrive) return;
  waitingForDrive = false;
  showMessage(
    elements.status,
    "Checking whether Google Drive connected...",
    "info"
  );
  setTimeout(fetchNotes, 700);
});

void getRedirectResult(auth).catch((error) => {
  showMessage(elements.authError, error.message || "Unable to complete sign-in.");
});

onAuthStateChanged(auth, showSignedInView, (error) => {
  showMessage(elements.authError, error.message || "Unable to check your sign-in.");
});
