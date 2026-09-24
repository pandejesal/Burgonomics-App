/**
 * Configuration error screen — rendered by the entry point when the app
 * refuses to boot (FR-004 Firebase misconfiguration fail-fast).
 *
 * HARD CONSTRAINT: this module must never import the Firebase chain (or any
 * module that does) — it renders precisely when those modules throw.
 * Dependency-free presentational output only.
 */
export function ConfigErrorScreen({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div
      role="alert"
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        background: "#F5F5F5",
        color: "#0E4825",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div style={{ maxWidth: "420px", textAlign: "center" }}>
        <p style={{ fontSize: "13px", fontWeight: 800, letterSpacing: "0.12em", margin: "0 0 8px" }}>
          BURGONOMICS
        </p>
        <h1 style={{ fontSize: "20px", fontWeight: 800, margin: "0 0 12px" }}>
          The app could not start
        </h1>
        <p style={{ fontSize: "14px", lineHeight: 1.5, margin: "0 0 12px" }}>
          A required service is not configured. Please update the app — if this
          keeps happening, contact support.
        </p>
        <details style={{ fontSize: "12px", textAlign: "left" }}>
          <summary style={{ cursor: "pointer", fontWeight: 700 }}>Technical details</summary>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              background: "#fff",
              border: "1px solid #ddd",
              borderRadius: "8px",
              padding: "12px",
              marginTop: "8px",
            }}
          >
            {message}
          </pre>
        </details>
      </div>
    </div>
  );
}
