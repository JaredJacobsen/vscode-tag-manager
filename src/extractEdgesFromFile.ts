import * as fs from "fs";
import { getBasename } from "./utils/getBasename";

type Edges = Set<string>;

//todo only read in first line unless reading from tagGraph.txt
export default async function extractEdgesFromFile(
  filepath: string
): Promise<Edges> {
  const baseName = getBasename(filepath);
  const buffer = await fs.promises.readFile(filepath);
  const edges: Edges = new Set();
  const matches = buffer.toString().matchAll(/\[([^\]]*->[^\]]*)\]/g);
  for (const match of matches) {
    const split = match[1].split("->").map((s) => s.trim());
    if (split.length === 3) {
      // handle two-way case: '->example->'
      edges.add(`${baseName}->${split[2]}`);
      edges.add(`${split[2]}->${baseName}`);
    } else {
      // handle cases: '->example' and 'example->'
      const [from, to] = split;
      edges.add(`${from || baseName}->${to || baseName}`);
    }
  }
  return edges;
}
