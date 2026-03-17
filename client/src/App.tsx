import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/ThemeProvider";
import NotFound from "@/pages/not-found";
import TranscriptEditor from "@/pages/TranscriptEditor";
import AnalysisView from "@/pages/AnalysisView";
import HealthPage from "@/pages/HealthPage";
import HomePage from "@/pages/HomePage";
import PerplexityAttribution from "@/components/PerplexityAttribution";

function Routes() {
  return (
    <Switch>
      <Route path="/" component={HomePage} />
      <Route path="/health" component={HealthPage} />
      <Route path="/videos/:videoId/:stem" component={TranscriptEditor} />
      <Route path="/videos/:videoId/:stem/analysis" component={AnalysisView} />
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <Router hook={useHashLocation}>
          <Routes />
        </Router>
        <Toaster />
        <PerplexityAttribution />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
