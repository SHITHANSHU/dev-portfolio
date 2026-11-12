import next from "eslint-config-next";
import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

const config = [
  ...next,
  ...coreWebVitals,
  ...typescript,
  { ignores: ["out/**", ".next/**", "scripts/**"] },
  { rules: { "@typescript-eslint/no-explicit-any": "error", "@typescript-eslint/no-non-null-assertion": "error" } },
];
export default config;
