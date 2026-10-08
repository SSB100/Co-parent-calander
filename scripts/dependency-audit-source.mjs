import ts from "typescript";
import { DEV_CHAIN } from "./dependency-audit-policy.mjs";

export function isRuntimeSource(file) {
  return !/^tests\//.test(file)
    && !/^scripts\/dependency-audit(?:-policy|-source)?\.mjs$/.test(file)
    && !/(^|\/)eslint\.config\.[cm]?[jt]s$/.test(file);
}

export function findRestrictedReferences(file, text) {
  const restricted = [...Object.keys(DEV_CHAIN), "eslint"];
  const references = [];
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  // Conservative literal scan covers static/dynamic imports, require, and subpaths.
  // Comments are not syntax nodes. Do not introduce computed module names for these packages.
  const visit = (node) => {
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && restricted.some((name) => node.text === name || node.text.startsWith(`${name}/`))) {
      references.push({ file, specifier: node.text });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return references;
}
