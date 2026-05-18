import React from "react";
import { Button } from "../ui/button";
import { createTranslator, isAppLanguage } from "../../lib/i18n";

function getFallbackT() {
  try {
    const lang = localStorage.getItem("gvmt-language") ?? "zh-CN";
    return createTranslator(isAppLanguage(lang) ? lang : "zh-CN");
  } catch {
    return createTranslator("zh-CN");
  }
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const t = getFallbackT();
      return (
        <main className="error-boundary">
          <section className="error-boundary-content">
            <h1>{t("error.title")}</h1>
            <p>{t("error.description")}</p>
            {this.state.error && (
              <pre className="error-boundary-detail">{this.state.error.message}</pre>
            )}
            <Button variant="default" onClick={this.handleReload}>
              {t("error.reload")}
            </Button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
