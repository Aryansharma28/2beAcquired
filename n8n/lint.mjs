// Catch n8n expression pitfalls before deploy: an expression segment ends at the first "}}", so nested
// object literals, spreads, etc. silently break with "invalid syntax" at runtime.
const STRINGS = /'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g;

export function lintWorkflow(wf) {
  const problems = [];
  const check = (value, where) => {
    let s = value;
    let i;
    while ((i = s.indexOf("{{")) >= 0) {
      const j = s.indexOf("}}", i + 2);
      if (j < 0) { problems.push(`${where}: unclosed {{`); return; }
      const seg = s.slice(i + 2, j).replace(STRINGS, "''");
      const count = (ch) => seg.split(ch).length - 1;
      if (count("{") !== count("}") || count("(") !== count(")") || count("[") !== count("]"))
        problems.push(`${where}: unbalanced expression …${seg.slice(-60)}`);
      if (/\.\.\.[\w$([]/.test(seg)) problems.push(`${where}: spread syntax is not supported in expressions`);
      s = s.slice(j + 2);
    }
  };
  const walk = (v, where) => {
    if (typeof v === "string") { if (v.startsWith("=")) check(v, where); }
    else if (v && typeof v === "object") for (const k of Object.keys(v)) walk(v[k], `${where}.${k}`);
  };
  for (const n of wf.nodes) if (n.type !== "n8n-nodes-base.code") walk(n.parameters, `${wf.name} › ${n.name}`);
  return problems;
}
