/** @type {import("lint-staged").Configuration} */
module.exports = {
  "*.{ts,tsx}": ["prettier --write", "eslint --fix"],
  "*.{js,mjs,json,md,css}": ["prettier --write"],
};
