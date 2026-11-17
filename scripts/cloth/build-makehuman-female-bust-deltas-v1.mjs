#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import process from 'node:process';

const COMMIT = '1f508f6083b2f823dab15de924b3bde72e08d77c';
const SOURCE_PATH =
  'makehuman/data/targets/breast/female-young-averagemuscle-averageweight-mincup-averagefirmness.target';
const SOURCE_SHA256 = '65e4ca16353f6c0e23b420cf5d9b31d8993943b76e6cd3a6961943371dd6bc2f';
const OUTPUT_PATH = 'src/assets/cloth/makehuman-hm08-female-bust-deltas-v1.bin';
const VISIBLE_BODY_VERTEX_COUNT = 13_380;
const SOURCE_UNIT_SCALE_TO_M = 0.1;
const MAGIC = 'GRBPFB01';
const FORMAT_VERSION = 1;
const HEADER_BYTE_LENGTH = 64;
const RECORD_BYTE_LENGTH = 16;

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function parseTarget(text) {
  const sourceRecords = [];
  for (const [lineIndex, line] of text.split(/\r?\n/u).entries()) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const fields = trimmed.split(/\s+/u);
    if (fields.length !== 4)
      throw new Error(`Target line ${lineIndex + 1} has the wrong field count.`);
    const [vertex, x, y, z] = fields.map(Number);
    if (!Number.isSafeInteger(vertex) || vertex < 0 || ![x, y, z].every(Number.isFinite)) {
      throw new Error(`Target line ${lineIndex + 1} is invalid.`);
    }
    sourceRecords.push(Object.freeze({ vertex, x, y, z }));
  }
  for (let index = 1; index < sourceRecords.length; index += 1) {
    if (sourceRecords[index - 1].vertex >= sourceRecords[index].vertex) {
      throw new Error('Target vertex indices must be strictly increasing.');
    }
  }
  const visibleRecords = sourceRecords.filter(({ vertex }) => vertex < VISIBLE_BODY_VERTEX_COUNT);
  if (visibleRecords.length === 0) throw new Error('Target has no visible-body records.');
  if (visibleRecords.some(({ x, y, z }) => x === 0 && y === 0 && z === 0)) {
    throw new Error('Target has a zero visible-body record.');
  }
  return Object.freeze({ sourceRecords, visibleRecords });
}

function encode(records, sourceRecordCount, sourceByteLength) {
  const byteLength = HEADER_BYTE_LENGTH + records.length * RECORD_BYTE_LENGTH;
  const bytes = Buffer.alloc(byteLength);
  bytes.write(MAGIC, 0, 'ascii');
  bytes.writeUInt32LE(FORMAT_VERSION, 8);
  bytes.writeUInt32LE(HEADER_BYTE_LENGTH, 12);
  bytes.writeUInt32LE(VISIBLE_BODY_VERTEX_COUNT, 16);
  bytes.writeUInt32LE(records.length, 20);
  bytes.writeUInt32LE(records.at(-1).vertex, 24);
  bytes.writeUInt32LE(sourceRecordCount, 28);
  bytes.writeUInt32LE(sourceByteLength, 32);
  bytes.writeUInt32LE(RECORD_BYTE_LENGTH, 36);
  bytes.writeDoubleLE(SOURCE_UNIT_SCALE_TO_M, 40);
  bytes.writeUInt32LE(HEADER_BYTE_LENGTH, 48);
  bytes.writeUInt32LE(byteLength, 52);
  bytes.writeUInt32LE(0, 56);
  bytes.writeUInt32LE(0, 60);
  records.forEach(({ vertex, x, y, z }, index) => {
    const offset = HEADER_BYTE_LENGTH + index * RECORD_BYTE_LENGTH;
    bytes.writeUInt32LE(vertex, offset);
    bytes.writeFloatLE(x, offset + 4);
    bytes.writeFloatLE(y, offset + 8);
    bytes.writeFloatLE(z, offset + 12);
  });
  return bytes;
}

async function main() {
  const sourceUrl = `https://raw.githubusercontent.com/makehumancommunity/makehuman/${COMMIT}/${SOURCE_PATH}`;
  const response = await fetch(sourceUrl, { redirect: 'error' });
  if (!response.ok) throw new Error(`Target request failed (${response.status}).`);
  const sourceBytes = Buffer.from(await response.arrayBuffer());
  const sourceDigest = sha256(sourceBytes);
  if (sourceDigest !== SOURCE_SHA256) {
    throw new Error(
      `Target SHA-256 mismatch: expected ${SOURCE_SHA256}, received ${sourceDigest}.`,
    );
  }
  const { sourceRecords, visibleRecords } = parseTarget(sourceBytes.toString('utf8'));
  const output = encode(visibleRecords, sourceRecords.length, sourceBytes.byteLength);
  const outputPath = resolve(process.cwd(), process.argv[2] ?? OUTPUT_PATH);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, output);
  console.log(`sha256 ${sha256(output)}  ${outputPath}`);
}

await main();
