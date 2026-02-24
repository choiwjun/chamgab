#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'

const ROOT = process.cwd()

const TARGETS = [
  'src/app/api/commercial',
  'src/components/business',
  'src/app/business-analysis',
  'src/app/api/admin/commercial/quality',
  'src/lib/api/commercial.ts',
  'ml-api/scripts/collect_business_statistics.py',
]

const ALLOWED_EXT = new Set(['.ts', '.tsx', '.py'])

const REPLACEMENT_CHAR = /\uFFFD/
const SUSPICIOUS_ASCII = /[ÃÂÐÕ]/
const CJK = /[\u4e00-\u9fff]/
const QUESTION_PREFIX_HANGUL = /\?[가-힣]/

function toPosix(input) {
  return input.split(path.sep).join('/')
}

function shouldSkipLine(line) {
  return (
    line.includes('MOJIBAKE_TOKEN_RE') ||
    line.includes('suspiciousAscii') ||
    line.includes('\\u00c3') ||
    line.includes('\\u00c2') ||
    line.includes('\\u00d0') ||
    line.includes('\\u00d5') ||
    line.includes('\\uFFFD')
  )
}

function isSuspicious(line) {
  if (shouldSkipLine(line)) return false
  return (
    REPLACEMENT_CHAR.test(line) ||
    SUSPICIOUS_ASCII.test(line) ||
    CJK.test(line) ||
    QUESTION_PREFIX_HANGUL.test(line)
  )
}

async function walk(targetPath, bucket) {
  const abs = path.join(ROOT, targetPath)
  const stat = await fs.stat(abs).catch(() => null)
  if (!stat) return

  if (stat.isFile()) {
    if (ALLOWED_EXT.has(path.extname(abs))) bucket.push(abs)
    return
  }

  const entries = await fs.readdir(abs, { withFileTypes: true })
  await Promise.all(
    entries.map(async (entry) => {
      const childRel = path.join(targetPath, entry.name)
      if (entry.isDirectory()) {
        await walk(childRel, bucket)
      } else if (entry.isFile()) {
        const childAbs = path.join(ROOT, childRel)
        if (ALLOWED_EXT.has(path.extname(childAbs))) bucket.push(childAbs)
      }
    })
  )
}

async function main() {
  const files = []
  for (const target of TARGETS) {
    await walk(target, files)
  }

  const findings = []
  for (const file of files) {
    const raw = await fs.readFile(file, 'utf8')
    const lines = raw.split(/\r?\n/)
    lines.forEach((line, idx) => {
      if (!line.trim()) return
      if (!isSuspicious(line)) return
      findings.push({
        file: toPosix(path.relative(ROOT, file)),
        line: idx + 1,
        text: line.trim().slice(0, 160),
      })
    })
  }

  if (findings.length === 0) {
    console.log('mojibake-check: OK')
    return
  }

  console.error(`mojibake-check: found ${findings.length} suspicious lines`)
  findings.slice(0, 200).forEach((item) => {
    console.error(`${item.file}:${item.line}: ${item.text}`)
  })
  process.exit(1)
}

main().catch((error) => {
  console.error('mojibake-check: failed', error)
  process.exit(1)
})

