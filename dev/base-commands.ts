/**
 * Custom Slash Command Extension
 *
 * Shows how to register your own slash commands.
 * This example adds /review and /explain commands.
 *
 * Drop this in ~/.pi/agent/extensions/ and it auto-loads.
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  // /review - sends a code review prompt to the agent
  pi.registerCommand("review-changes", {
    description: "Review recent changes for issues",
    handler: async (args, _ctx) => {
      const focus = args || "security, performance, and correctness";
      await pi.sendUserMessage(
        `Review the recent changes in this project. Focus on: ${focus}. ` +
        `Run git diff to see what changed, then give specific feedback.`
      );
    },
  });

}
