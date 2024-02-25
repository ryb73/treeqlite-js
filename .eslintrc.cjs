"use strict";

/** @type {import('@typescript-eslint/utils').TSESLint.Linter.ConfigType} */
module.exports = {
  extends: [`plugin:deprecation/recommended`, `@ryb73`],

  overrides: [
    {
      files: [`src/bundler.ts`, `src/nodejs.ts`],
      rules: {
        "import/no-unused-modules": `off`,
      },
    },
  ],

  rules: {
    "testing-library/no-debugging-utils": `off`,
  },
};
