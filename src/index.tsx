import React from "react";
import { render } from "ink";
import { App } from "./app.js";

const enterAlternateScreen = "\u001B[?1049h\u001B[2J\u001B[H";
const leaveAlternateScreen = "\u001B[?1049l";

let restored = false;

const restoreTerminal = () => {
  if (restored) {
    return;
  }

  restored = true;
  process.stdout.write(leaveAlternateScreen);
};

process.stdout.write(enterAlternateScreen);

process.on("exit", restoreTerminal);
process.on("SIGINT", () => {
  restoreTerminal();
  process.exit(130);
});
process.on("SIGTERM", () => {
  restoreTerminal();
  process.exit(143);
});

const instance = render(<App />);
const originalUnmount = instance.unmount;
instance.unmount = () => {
  restoreTerminal();
  originalUnmount();
};
