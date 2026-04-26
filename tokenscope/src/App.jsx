import { useState } from "react";
import { C } from "./constants/theme.js";
import { useAuth } from "./hooks/useAuth.js";
import { useIsMobile } from "./hooks/useIsMobile.js";
import { useUsageData } from "./hooks/useUsageData.js";
import { Header } from "./components/layout/Header.jsx";
import { TabBar } from "./components/layout/TabBar.jsx";
import { ModeBar } from "./components/layout/ModeBar.jsx";
import { Login } from "./components/Login.jsx";
import { Mono } from "./components/shared/Mono.jsx";
import { LoadingPanel } from "./components/shared/LoadingPanel.jsx";
import { EmptyState } from "./components/shared/EmptyState.jsx";
import { Overview } from "./pages/Overview.jsx";
import { ByTag } from "./pages/ByTag.jsx";
import { Models } from "./pages/Models.jsx";
import { Log } from "./pages/Log.jsx";

export default function App() {
  const { session, user, loading: authLoading, signIn, signOut } = useAuth();
  const isMobile  = useIsMobile();
  const [tab,    setTab]    = useState("overview");
  const [mode,   setMode]   = useState("weighted");
  const [winSel, setWinSel] = useState("7d");

  const usage = useUsageData({ window: winSel, mode, user });

  if (authLoading) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg }}>
        <div style={{ padding: 32, maxWidth: 480, margin: "0 auto" }}>
          <LoadingPanel label="restoring session" />
        </div>
      </div>
    );
  }

  if (!session) return <Login onSubmit={signIn} />;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.bg,
        color: C.text,
        fontFamily: "'DM Sans', sans-serif",
        paddingBottom: isMobile ? 76 : 0,
      }}
    >
      <Header
        isMobile={isMobile}
        windowSel={winSel}
        onWindowChange={setWinSel}
        mode={mode}
        onModeChange={setMode}
        user={user}
        onSignOut={signOut}
      />
      {!isMobile && <TabBar tab={tab} onTabChange={setTab} variant="top" />}
      <ModeBar mode={mode} windowSel={winSel} isMobile={isMobile} />

      <main
        style={{
          padding: isMobile ? "16px" : "28px 36px",
          maxWidth: 1360,
          margin: "0 auto",
        }}
      >
        {usage.loading && <LoadingPanel label={`loading ${winSel}`} />}
        {usage.error && (
          <EmptyState
            title="Couldn't load usage"
            body={
              <Mono style={{ color: C.red }}>{usage.error}</Mono>
            }
            accent={C.red}
          />
        )}
        {!usage.loading && !usage.error && usage.data && (
          <PageContent
            tab={tab}
            data={usage.data}
            mode={mode}
            windowSel={winSel}
            isMobile={isMobile}
          />
        )}
      </main>

      {isMobile && <TabBar tab={tab} onTabChange={setTab} variant="bottom" />}
    </div>
  );
}

function PageContent({ tab, data, mode, windowSel, isMobile }) {
  // Global empty state when there's truly no data anywhere in the window —
  // skip on the Log tab so the per-tab empty messaging stays consistent.
  const hasAnyData = data.now.callCount > 0 || data.now.recentCalls?.length;
  if (!hasAnyData && tab !== "log") {
    return (
      <EmptyState
        title="No usage logged in this window"
        body={
          <>
            Drop the wrapper into your code and send one tagged call:
            <pre
              style={{
                marginTop: 12,
                background: C.cardAlt,
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                padding: "10px 12px",
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 12,
                color: C.text,
                textAlign: "left",
                overflowX: "auto",
              }}
            >{`import { claudeCall } from "tokenscope";

await claudeCall({
  tag: "smoke-test",
  messages: [{ role: "user", content: "ping" }],
});`}</pre>
          </>
        }
      />
    );
  }

  switch (tab) {
    case "overview": return <Overview data={data} mode={mode} windowSel={windowSel} isMobile={isMobile} />;
    case "by-tag":   return <ByTag    data={data} mode={mode} isMobile={isMobile} />;
    case "models":   return <Models   data={data} mode={mode} isMobile={isMobile} />;
    case "log":      return <Log      data={data} isMobile={isMobile} />;
    default:         return null;
  }
}
