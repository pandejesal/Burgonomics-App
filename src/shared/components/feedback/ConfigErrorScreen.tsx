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
        // System colours keep this dependency-free crash screen legible in
        // both OS appearances without importing the app theme chain.
        background: "Canvas",
        color: "CanvasText",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div style={{ maxWidth: "420px", textAlign: "center" }}>
        <p style={{ fontSize: "14px", fontWeight: 600, margin: "0 0 8px" }}>BURGONOMICS</p>
        <h1 style={{ fontSize: "24px", fontWeight: 600, margin: "0 0 12px" }}>
          The app could not start
        </h1>
        <p style={{ fontSize: "16px", lineHeight: 1.6, margin: "0 0 12px" }}>
          A required service is not configured. Please update the app — if this keeps happening,
          contact support.
        </p>
        <details style={{ fontSize: "14px", textAlign: "left" }}>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>Technical details</summary>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              background: "Canvas",
              border: "1px solid GrayText",
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
