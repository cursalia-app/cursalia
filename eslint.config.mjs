import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Prohibido `any` en todo el proyecto: si no se conoce el tipo, `unknown`.
      "@typescript-eslint/no-explicit-any": "error",
      // Permite descartar campos con rest: `const { modules, ...course } = tree`.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { ignoreRestSiblings: true, argsIgnorePattern: "^_" },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "public/**", "next-env.d.ts"]),
]);

export default eslintConfig;
