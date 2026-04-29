// ============================================================
// Merkle Tree — extracted from camelcabal.fun bundle
// Handles uneven trees (not power-of-2) used by their WL system
// ============================================================

import { ethers } from "ethers";

export interface MerkleProof {
  index: number;
  leaf: string;
  proof: { data: Buffer; right: boolean }[];
}

export class MerkleTree {
  private layers: Map<number, Map<number, { key: string; hash: Buffer; left?: { key: string; hash: Buffer; parent?: any }; right?: { key: string; hash: Buffer; parent?: any }; parent?: any }>> = new Map();
  private nodes: Map<number, Map<number, Buffer>> = new Map();
  private leaves: Buffer[] = [];

  constructor(private keys: string[]) {
    this.build();
  }

  private hash(data: Buffer): Buffer {
    return Buffer.from(ethers.keccak256(data).slice(2), "hex");
  }

  private bufferToHex(buf: Buffer): string {
    return "0x" + buf.toString("hex");
  }

  private build(): void {
    if (this.keys.length === 0) return;

    // Sort keys
    const sorted = [...this.keys].sort((a, b) => a.localeCompare(b));
    const depth = Math.ceil(Math.log2(sorted.length || 1));
    const size = Math.pow(2, depth + 1);

    // Layer 0: leaves
    const leafMap = new Map<number, { key: string; hash: Buffer; left?: any; right?: any }>();
    for (let i = 0; i < sorted.length; i++) {
      const hash = this.hash(Buffer.from(sorted[i].slice(2), "hex"));
      leafMap.set(i, { key: sorted[i], hash });
      if (!this.leaves[i]) this.leaves[i] = hash;
    }
    this.layers.set(0, leafMap);

    let currentLayer = leafMap;
    let currentNodes = new Map<number, Buffer>();

    for (let i = 1; i <= depth + 1; i++) {
      const nextMap = new Map<number, { key: string; hash: Buffer; left?: any; right?: any }>();
      const nextNodes = new Map<number, Buffer>();
      let idx = 0;

      const entries = Array.from(currentLayer.entries()).sort((a, b) => a[0] - b[0]);

      for (let j = 0; j < entries.length; j += 2) {
        const [leftIdx, left] = entries[j];
        const rightEntry = entries[j + 1];

        let right: { key: string; hash: Buffer } | undefined;
        if (rightEntry) {
          right = rightEntry[1];
          right.left = left;
          left.right = right;
        }

        // For uneven tree: if no right sibling, the left node is the parent
        let parentHash: Buffer;
        if (!right) {
          parentHash = left.hash;
        } else {
          const concat = Buffer.concat([left.hash, right.hash].sort((a, b) => a.compare(b)));
          parentHash = this.hash(concat);
        }

        const parent: { key: string; hash: Buffer; left?: any; right?: any } = {
          key: `node_${idx}`,
          hash: parentHash,
          left,
          right,
        };
        left.parent = parent;
        if (right) right.parent = parent;

        nextMap.set(idx, parent);
        nextNodes.set(idx, parentHash);
        idx++;
      }

      this.layers.set(i, nextMap);
      this.nodes.set(i, nextNodes);
      currentLayer = nextMap;
      currentNodes = nextNodes;

      if (currentLayer.size === 1) break;
    }
  }

  getRoot(): Buffer {
    const lastLayer = Math.max(...Array.from(this.layers.keys()));
    const layer = this.layers.get(lastLayer);
    if (!layer || layer.size === 0) return Buffer.alloc(32);
    const entries = Array.from(layer.entries());
    return entries[0][1].hash;
  }

  getHexRoot(): string {
    return this.bufferToHex(this.getRoot());
  }

  getProof(address: string): { data: Buffer; right: boolean }[] {
    const sorted = [...this.keys].sort((a, b) => a.localeCompare(b));
    const idx = sorted.indexOf(address.toLowerCase());
    if (idx === -1) throw new Error(`Address ${address} not in merkle tree`);

    const proof: { data: Buffer; right: boolean }[] = [];
    let current = this.layers.get(0)?.get(idx);
    if (!current) return proof;

    while (current.parent) {
      const isRight = current.parent.right === current;
      const sibling = isRight ? current.parent.left : current.parent.right;
      if (sibling) {
        proof.push({ data: sibling.hash, right: !isRight });
      }
      current = current.parent;
    }

    return proof;
  }

  getHexProof(address: string): string[] {
    return this.getProof(address).map((p) => this.bufferToHex(p.data));
  }

  verifyProof(address: string, proof: { data: Buffer; right: boolean }[], root: Buffer): boolean {
    let hash = this.hash(Buffer.from(address.slice(2), "hex"));

    for (const p of proof) {
      const sorted = [hash, p.data].sort((a, b) => a.compare(b));
      hash = this.hash(Buffer.concat(sorted));
    }

    return hash.equals(root);
  }
}

/**
 * Build a MerkleProof for a given address from the whitelist data.
 * The tier JSON files contain:
 *   - merkleRoot: the root hash
 *   - whitelistAddresses: the sorted list of addresses
 *   - each address's slot
 *
 * Usage:
 *   const proof = buildMerkleProof(address, whitelistAddresses);
 *   // proof.proof = hex array ready for contract call
 *   // proof.slot = slot number for this address
 */
export function buildMerkleProof(
  address: string,
  whitelistAddresses: string[]
): { proof: string[]; slot: number } {
  const tree = new MerkleTree(whitelistAddresses);
  const hexProof = tree.getHexProof(address.toLowerCase());
  const sorted = [...whitelistAddresses].sort((a, b) => a.localeCompare(b));
  const slot = sorted.indexOf(address.toLowerCase());

  return {
    proof: hexProof,
    slot: slot,
  };
}
