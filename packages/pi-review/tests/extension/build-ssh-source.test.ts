import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

import { execSync } from "node:child_process";
import { buildSSHSource } from "../../extensions/pi-reviewer/index.js";

const execSyncMock = vi.mocked(execSync);

describe("buildSSHSource", () => {
  beforeEach(() => {
    execSyncMock.mockReset();
  });

  it("returns PR label for --pr", () => {
    const result = buildSSHSource({ pr: 42 } as any, "/repo");
    expect(result).toBe("PR #42");
    expect(execSyncMock).not.toHaveBeenCalled();
  });

  it("returns git diff label for --diff", () => {
    const result = buildSSHSource({ diff: "HEAD~2" } as any, "/repo");
    expect(result).toBe("git diff HEAD~2");
    expect(execSyncMock).not.toHaveBeenCalled();
  });

  it("returns 'HEAD vs <branch>' for --branch", () => {
    execSyncMock.mockReturnValueOnce("feat/x\n"); // detectCurrentBranch

    const result = buildSSHSource({ branch: "develop" } as any, "/repo");

    expect(result).toBe("feat/x vs develop");
  });

  it("returns 'current vs origin/main' by default (auto-detect both)", () => {
    execSyncMock
      .mockReturnValueOnce("feat/api\n")    // detectCurrentBranch
      .mockReturnValueOnce("origin/main\n"); // detectOriginBase

    const result = buildSSHSource({} as any, "/repo");

    expect(result).toBe("feat/api vs origin/main");
  });

  it("falls back to HEAD when current branch detection fails", () => {
    execSyncMock
      .mockImplementationOnce(() => { throw new Error("not a git repo"); }) // detectCurrentBranch
      .mockReturnValueOnce("origin/main\n"); // detectOriginBase

    const result = buildSSHSource({} as any, "/repo");

    expect(result).toBe("HEAD vs origin/main");
  });

  it("falls back to origin/main when base branch detection fails", () => {
    execSyncMock
      .mockReturnValueOnce("feat/x\n")                                        // detectCurrentBranch
      .mockImplementationOnce(() => { throw new Error("symbolic-ref failed"); }); // detectOriginBase

    const result = buildSSHSource({} as any, "/repo");

    expect(result).toBe("feat/x vs origin/main");
  });

  it("falls back to HEAD vs origin/main when both detections fail", () => {
    execSyncMock
      .mockImplementationOnce(() => { throw new Error(); }) // detectCurrentBranch
      .mockImplementationOnce(() => { throw new Error(); }); // detectOriginBase

    const result = buildSSHSource({} as any, "/repo");

    expect(result).toBe("HEAD vs origin/main");
  });
});
