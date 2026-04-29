// One-shot script to convert a Word .docx prompt file into a clean
// .md file by extracting paragraph text from word/document.xml.
//
// Usage: node scripts/docx-to-md.mjs <input.docx> <output.md>
//
// The script handles the subset of Word XML we actually use in the
// reference/ prompts: paragraphs (<w:p>) and runs (<w:r><w:t>...).
// Lists, tables, comments, etc. are not preserved — but the prompt
// files are plain prose with light heading structure, so the simple
// run-extraction is enough.

import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

const [, , inPath, outPath] = process.argv;
if (!inPath || !outPath) {
  console.error("usage: node scripts/docx-to-md.mjs <input.docx> <output.md>");
  process.exit(1);
}

// Extract word/document.xml from the .docx (which is a ZIP archive).
const tmp = path.join(tmpdir(), `docx-${Date.now()}.xml`);
execSync(`unzip -p "${inPath}" word/document.xml > "${tmp}"`, {
  stdio: ["ignore", "ignore", "inherit"],
});
const xml = readFileSync(tmp, "utf8");

// Decode XML entities to their literal characters.
function decodeEntities(s) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

// Walk every <w:p>...</w:p> paragraph. Within each, gather the text
// of every <w:t>...</w:t> run (concatenated to form the paragraph).
// Word also uses <w:tab/> and <w:br/> within runs — those become tab
// and newline characters in the output.
const paragraphs = [];
const paragraphRegex = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g;
const textRegex = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
let pMatch;
while ((pMatch = paragraphRegex.exec(xml)) !== null) {
  const inner = pMatch[1]
    .replace(/<w:tab\b[^/]*\/>/g, "\t")
    .replace(/<w:br\b[^/]*\/>/g, "\n");
  let text = "";
  let tMatch;
  while ((tMatch = textRegex.exec(inner)) !== null) {
    text += decodeEntities(tMatch[1]);
  }
  paragraphs.push(text);
}

// Join paragraphs with a blank line between them. Trim leading/trailing
// blank paragraphs so the output starts and ends cleanly.
const md = paragraphs.join("\n\n").trim() + "\n";
writeFileSync(outPath, md);
console.log(
  `wrote ${md.length.toLocaleString()} chars to ${outPath} (${paragraphs.length} paragraphs)`,
);
