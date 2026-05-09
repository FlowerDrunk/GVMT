import React from "react";
import { Button } from "../ui/button";

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
      return (
        <main className="error-boundary">
          <section className="error-boundary-content">
            <h1>应用出现错误</h1>
            <p>抱歉，应用遇到了一个意外错误。请刷新页面重试。</p>
            {this.state.error && (
              <pre className="error-boundary-detail">{this.state.error.message}</pre>
            )}
            <Button variant="default" onClick={this.handleReload}>
              刷新重试
            </Button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
