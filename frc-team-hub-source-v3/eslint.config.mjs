import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "desktop/**",
    "dist-desktop/**",
    "public/wasm/**",
    "next-env.d.ts",
  ]),
  {
    files: ["hardware/scripts/*.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    files: ["src/app/layout.tsx"],
    rules: {
      "@next/next/no-page-custom-font": "off",
    },
  },
]);

export default eslintConfig;
