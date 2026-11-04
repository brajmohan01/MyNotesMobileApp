
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  FlatList,
  RefreshControl,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { WebView } from "react-native-webview";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, "");

function getApiUrl(path) {
  if (!API_BASE_URL) {
    throw new Error(
      "Set EXPO_PUBLIC_API_URL in mobile/.env to your backend URL."
    );
  }

  return `${API_BASE_URL}/api${path}`;
}

export default function App() {
  const [notes, setNotes] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedNote, setSelectedNote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  // Fetch notes from Express backend
  async function fetchNotes(query = "") {
    try {
      setError("");

      const url = getApiUrl(
        `/notes?search=${encodeURIComponent(query)}`
      );
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error("Unable to connect to notes API");
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error("Unable to load notes");
      }

      setNotes(data.notes);
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  // Fetch individual note
  async function openNote(note) {
    try {
      setLoading(true);
      setError("");

      const response = await fetch(
        getApiUrl(`/notes/${encodeURIComponent(note.id)}`)
      );
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error("Unable to open note");
      }

      setSelectedNote({
        ...note,
        content: data.content,
      });
    } catch (err) {
      setError(err.message || "Unable to open note");
    } finally {
      setLoading(false);
    }
  }

  // Return to notes list
  function goBack() {
    setSelectedNote(null);
    setError("");
  }

  // Initial notes loading
  useEffect(() => {
    fetchNotes();
  }, []);

  // Search notes with debounce
  useEffect(() => {
    if (selectedNote) return;

    const timer = setTimeout(() => {
      fetchNotes(search);
    }, 350);

    return () => clearTimeout(timer);
  }, [search, selectedNote]);

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

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Your Notes</Text>

        <Text style={styles.noteCount}>
          {notes.length} notes
        </Text>
      </View>

      {loading && notes.length === 0 ? (
        <ActivityIndicator
          size="large"
          color="#2563eb"
          style={styles.loader}
        />
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
          Synced from your Google Drive
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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

  loader: {
    marginTop: 50,
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
