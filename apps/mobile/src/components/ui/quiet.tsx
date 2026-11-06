import { Component, type ReactNode } from "react";

/**
 * Keeps one part of a screen from taking the rest down: if what it holds throws while drawing (a Convex function the
 * deployment does not have yet, say), it draws nothing in its place and says why in the log. For optional parts only
 * (a settings card); a screen's own content should fail where it can be seen.
 */
export class Quiet extends Component<{ name: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.warn(`${this.props.name} could not draw:`, error instanceof Error ? error.message : error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
