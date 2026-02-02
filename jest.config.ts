import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  moduleFileExtensions: ["ts", "js", "json"],
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        tsconfig: {
          // Override for tests - don't include figma typings (we mock them)
          target: "ES2017",
          module: "commonjs",
          lib: ["ES2017"],
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          moduleResolution: "node",
          rootDir: ".",
          typeRoots: ["./node_modules/@types"],
        },
      },
    ],
  },
};

export default config;
