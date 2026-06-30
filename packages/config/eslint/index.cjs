module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint"],
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  env: { node: true, es2022: true },
  rules: {
    // Invariant 1: catch accidental float money handling early.
    "no-restricted-properties": ["warn",
      { "object": "Math", "property": "round", "message": "Round money in cents helpers, not ad hoc." }
    ]
  }
};
