// Validate the baked droop channel against real clinical (mass, SN-N) pairs
// gathered by the literature agents (research/40). Model reading (report B):
// droop_cm = DESCENT below a normal SN-N, so predicted SN-N ≈ normal + droop.
// Normal SN-N ≈ 19-21 cm (Regnault/ptosis literature) — use 20.
import { readFileSync } from 'node:fs'

const DATA = '/Users/benjaminsolomon/Projects/gaming/Aventuras/src/lib/services/be/ladder-data.ts'
const src = readFileSync(DATA, 'utf8')

// Pull the baked natural droop curve out of the generated file (prettier
// reformats it to unquoted keys, so grab the first `empty: [...]` after
// DROOP_CM_CURVES → natural).
const block = src.slice(src.indexOf('export const DROOP_CM_CURVES'))
const nat = block.slice(block.indexOf('natural'))
const arr = nat.match(/empty:\s*\[([\s\S]*?)\]/)
if (!arr) throw new Error('natural.empty not found')
const droopNatural = arr[1]
  .split(',')
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n))
if (droopNatural.length < 100) throw new Error(`droop curve too short: ${droopNatural.length}`)

// Invert the validated mass quadratic: m(t) = 0.18 + 0.055t + 0.002t^2  (kg/side)
const tierForKg = (kg) => {
  const a = 0.002,
    b = 0.055,
    c = 0.18 - kg
  return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a)
}
const droopAt = (t) => {
  const i = Math.max(0, Math.min(Math.round(t), droopNatural.length - 1))
  return droopNatural[i]
}

const NORMAL_SNN = 20

// Clinical pairs (mass per breast kg, observed SN-N cm, context). Anonymized —
// case identity is irrelevant to calibration; source citations live in research/40.
const CASES = [
  { kg: 0.83, snn: 35.3, note: 'series n=20 mean (BMI 20-44)' },
  { kg: 0.81, snn: 38.5, note: 'series n=15, mean of a 1.66/1.80kg case @BMI31' },
  { kg: 1.79, snn: 41.0, note: 'series n=19 mean' },
  { kg: 1.73, snn: 40.0, note: 'series n=19, itemized case (2.0kg @SN-N 40)' },
  { kg: 2.94, snn: 45.0, note: 'gestational, R side' },
  { kg: 3.5, snn: 36.0, note: 'juvenile, height 150, BMI 21.3' },
  { kg: 3.8, snn: 36.0, note: 'juvenile, L side, same patient' },
  { kg: 4.75, snn: 48.0, note: 'gestational, L side' },
  { kg: 5.15, snn: 50.0, note: 'gestational multiparity, BMI 35' },
  { kg: 5.53, snn: 52.0, note: 'same patient, L side' },
  { kg: 5.7, snn: 60.0, note: 'gigantomastia, BMI 54 (extreme habitus)' },
  { kg: 8.5, snn: 46.0, note: 'juvenile extreme, height 160, BMI 24' },
]

console.log('mass/side | tier | model droop | predicted SN-N | observed | resid | note')
console.log('----------|------|-------------|----------------|----------|-------|-----')
const resid = []
for (const c of CASES) {
  const t = tierForKg(c.kg)
  const d = droopAt(t)
  const pred = NORMAL_SNN + d
  const r = c.snn - pred
  resid.push(r)
  console.log(
    `${c.kg.toFixed(2).padStart(9)} | ${t.toFixed(1).padStart(4)} | ${d.toFixed(1).padStart(11)} | ${pred.toFixed(1).padStart(14)} | ${c.snn.toFixed(1).padStart(8)} | ${r >= 0 ? '+' : ''}${r.toFixed(1).padStart(4)} | ${c.note}`,
  )
}

const mean = resid.reduce((a, b) => a + b, 0) / resid.length
const sd = Math.sqrt(resid.reduce((a, b) => a + (b - mean) ** 2, 0) / (resid.length - 1))
const absMean = resid.reduce((a, b) => a + Math.abs(b), 0) / resid.length
console.log(`\nn=${resid.length}`)
console.log(`mean residual (observed − predicted): ${mean >= 0 ? '+' : ''}${mean.toFixed(2)} cm`)
console.log(`mean |residual|: ${absMean.toFixed(2)} cm   SD: ${sd.toFixed(2)} cm`)
console.log(`range: ${Math.min(...resid).toFixed(1)} .. +${Math.max(...resid).toFixed(1)} cm`)

// Excluding the two extreme-habitus outliers (BMI 54; and the very-short juvenile)
const trimmed = CASES.filter((c) => !c.note.includes('BMI 54') && !c.note.includes('height 150'))
const tr = trimmed.map((c) => c.snn - (NORMAL_SNN + droopAt(tierForKg(c.kg))))
const trMean = tr.reduce((a, b) => a + b, 0) / tr.length
const trAbs = tr.reduce((a, b) => a + Math.abs(b), 0) / tr.length
console.log(
  `\nexcluding 3 extreme-habitus rows (n=${tr.length}): mean ${trMean >= 0 ? '+' : ''}${trMean.toFixed(2)} cm, mean |resid| ${trAbs.toFixed(2)} cm`,
)
